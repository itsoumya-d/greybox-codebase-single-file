import { useEffect, useRef, useState } from 'react';
import type { GameType, WizardCharacter } from '../useWizardState';
import { getCloudApiKey } from '../SettingsPanel';

const CLOUD_API_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CLOUD_API_URL
    ? process.env.NEXT_PUBLIC_CLOUD_API_URL
    : 'http://localhost:3000';

const SPRITE_QUOTA_KEY = 'greybox_sprite_remaining';

const POLL_INTERVAL_MS = 3000;

function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? url : undefined;
  } catch { return undefined; }
}

const CHARACTER_TYPES: Array<{ value: WizardCharacter['type']; label: string }> = [
  { value: 'player', label: 'Player' },
  { value: 'enemy', label: 'Enemy' },
  { value: 'npc', label: 'NPC' },
  { value: 'boss', label: 'Boss' },
];

interface Props {
  characters: WizardCharacter[];
  artStyle: string;
  gameType: GameType;
  error: string | null;
  onAdd: (char: WizardCharacter) => void;
  onUpdate: (id: string, patch: Partial<WizardCharacter>) => void;
  onRemove: (id: string) => void;
}

export function CharacterStep({ characters, artStyle, gameType, error, onAdd, onUpdate, onRemove }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<WizardCharacter['type']>('player');
  const [formStyle, setFormStyle] = useState(artStyle);
  const [formHp, setFormHp] = useState(100);
  const [formSpeed, setFormSpeed] = useState(5);
  const [formDamage, setFormDamage] = useState(10);
  /** Remaining 3D generations this month. undefined = not yet known, null = unlimited. */
  const [remaining, setRemaining] = useState<number | null | undefined>(undefined);
  /** Remaining 2D sprite generations this month. undefined = not yet known, null = unlimited. */
  const [spriteRemaining, setSpriteRemaining] = useState<number | null | undefined>(undefined);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Clean up timers on unmount
  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      timers.forEach((t) => clearInterval(t));
    };
  }, []);

  function handleAdd() {
    if (!formName.trim()) return;
    const id = `char-${Date.now()}`;
    onAdd({
      id,
      name: formName.trim(),
      description: formDesc.trim(),
      type: formType,
      style: formStyle,
      stats: { hp: formHp, speed: formSpeed, damage: formDamage },
    });
    // Reset form
    setFormName('');
    setFormDesc('');
    setFormType('player');
    setFormStyle(artStyle);
    setFormHp(100);
    setFormSpeed(5);
    setFormDamage(10);
    setShowForm(false);
  }

  async function handleGenerate3D(char: WizardCharacter) {
    onUpdate(char.id, { jobStatus: 'queued', jobProgress: 0 });
    try {
      const apiKey = getCloudApiKey();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const resp = await fetch(`${CLOUD_API_URL}/v1/characters/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: char.description || char.name,
          style: char.style,
          art_style: artStyle,
        }),
      });

      if (!resp.ok) {
        onUpdate(char.id, { jobStatus: 'failed' });
        if (resp.status === 429 || resp.status === 402) {
          // Quota exhausted or tier doesn't allow generation.
          setRemaining(0);
        }
        return;
      }

      const data = (await resp.json()) as { jobId: string; remaining?: number | null };
      if (data.remaining !== undefined) setRemaining(data.remaining);
      onUpdate(char.id, { jobId: data.jobId, jobStatus: 'queued' });
      startPolling(char.id, data.jobId);
    } catch {
      onUpdate(char.id, { jobStatus: 'failed' });
    }
  }

  async function handleGenerateSprite(char: WizardCharacter) {
    onUpdate(char.id, { spriteGenerating: true, spriteFailed: false });
    try {
      const apiKey = getCloudApiKey();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const resp = await fetch(`${CLOUD_API_URL}/v1/sprites/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: char.description || char.name,
          style: char.style,
        }),
      });
      if (!resp.ok) {
        onUpdate(char.id, { spriteGenerating: false, spriteFailed: true });
        if (resp.status === 429 || resp.status === 402) setSpriteRemaining(0);
        return;
      }
      const data = (await resp.json()) as { imageUrl: string; remaining?: number | null };
      if (data.remaining !== undefined) setSpriteRemaining(data.remaining);
      onUpdate(char.id, { spriteUrl: data.imageUrl, spriteGenerating: false, spriteFailed: false });
    } catch {
      onUpdate(char.id, { spriteGenerating: false, spriteFailed: true });
    }
  }

  function startPolling(charId: string, jobId: string) {
    // Stop any existing timer for this char
    const existing = pollTimers.current.get(charId);
    if (existing) clearInterval(existing);

    const timer = setInterval(async () => {
      try {
        const apiKey = getCloudApiKey();
        const pollHeaders: Record<string, string> = {};
        if (apiKey) pollHeaders['Authorization'] = `Bearer ${apiKey}`;

        const resp = await fetch(`${CLOUD_API_URL}/v1/characters/jobs/${encodeURIComponent(jobId)}`, {
          headers: pollHeaders,
        });
        if (!resp.ok) {
          clearInterval(timer);
          pollTimers.current.delete(charId);
          onUpdate(charId, { jobStatus: 'failed' });
          return;
        }
        const data = (await resp.json()) as {
          status: 'queued' | 'processing' | 'complete' | 'failed';
          progress: number;
          assetUrl?: string;
        };
        onUpdate(charId, {
          jobStatus: data.status,
          jobProgress: data.progress,
          ...(data.assetUrl ? { assetUrl: data.assetUrl } : {}),
        });
        if (data.status === 'complete' || data.status === 'failed') {
          clearInterval(timer);
          pollTimers.current.delete(charId);
        }
      } catch {
        clearInterval(timer);
        pollTimers.current.delete(charId);
        onUpdate(charId, { jobStatus: 'failed' });
      }
    }, POLL_INTERVAL_MS);

    pollTimers.current.set(charId, timer);
  }

  return (
    <div className="wizard-step character-step">
      <div className="wizard-step-header">
        <h2 className="wizard-step-title">Create your characters</h2>
        <p className="wizard-step-hint">
          {gameType === '2D' || gameType === 'Mobile-2D'
            ? 'Add your characters and generate 2D sprites.'
            : 'Add your characters. Generate 3D models or 2D sprites.'}
        </p>
      </div>

      <div className="wizard-step-body">
        {error && (
          <div className="wizard-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {remaining === 0 && (
          <div className="wizard-error" role="alert">
            Monthly 3D generation quota reached. Resets on the 1st of next month.
          </div>
        )}
        {remaining !== undefined && remaining !== null && remaining > 0 && (
          <div className="character-quota-badge">
            {remaining} 3D generation{remaining === 1 ? '' : 's'} remaining this month
          </div>
        )}

        {/* Character list */}
        {characters.length === 0 && !showForm && (
          <div className="characters-empty">
            <p>No characters yet. Add your first character to get started.</p>
          </div>
        )}

        <div className="character-list">
          {characters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              gameType={gameType}
              quotaExhausted={remaining === 0}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onGenerate3D={handleGenerate3D}
              spriteQuotaExhausted={spriteRemaining === 0}
              onGenerateSprite={handleGenerateSprite}
            />
          ))}
        </div>

        {/* Add character form */}
        {showForm ? (
          <div className="character-form">
            <h3 className="character-form-title">New character</h3>
            <div className="character-form-grid">
              <label className="wizard-label">
                Name
                <input
                  className="wizard-input"
                  autoFocus
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Hero, Goblin, Village Elder..."
                />
              </label>
              <label className="wizard-label">
                Type
                <select
                  className="wizard-select"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as WizardCharacter['type'])}
                >
                  {CHARACTER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="wizard-label wide">
                Description
                <textarea
                  className="wizard-textarea"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Visual appearance, personality, role in the game..."
                  rows={2}
                />
              </label>
              <label className="wizard-label wide">
                Visual style override
                <input
                  className="wizard-input"
                  value={formStyle}
                  onChange={(e) => setFormStyle(e.target.value)}
                  placeholder={artStyle || 'Art style...'}
                />
              </label>
              <label className="wizard-label">
                HP
                <input
                  className="wizard-input"
                  type="number"
                  min={1}
                  value={formHp}
                  onChange={(e) => setFormHp(Number(e.target.value))}
                />
              </label>
              <label className="wizard-label">
                Speed
                <input
                  className="wizard-input"
                  type="number"
                  min={1}
                  value={formSpeed}
                  onChange={(e) => setFormSpeed(Number(e.target.value))}
                />
              </label>
              <label className="wizard-label">
                Damage
                <input
                  className="wizard-input"
                  type="number"
                  min={0}
                  value={formDamage}
                  onChange={(e) => setFormDamage(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="character-form-actions">
              <button
                type="button"
                className="primary"
                onClick={handleAdd}
                disabled={!formName.trim()}
              >
                Add character
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="wizard-btn-secondary character-add-btn"
            onClick={() => setShowForm(true)}
          >
            + Add character
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CharacterCard
// ---------------------------------------------------------------------------

interface CharacterCardProps {
  character: WizardCharacter;
  gameType: GameType;
  quotaExhausted?: boolean;
  onUpdate: (id: string, patch: Partial<WizardCharacter>) => void;
  onRemove: (id: string) => void;
  onGenerate3D: (char: WizardCharacter) => void;
  spriteQuotaExhausted?: boolean;
  onGenerateSprite: (char: WizardCharacter) => void;
}

function CharacterCard({ character, gameType, quotaExhausted, onUpdate, onRemove, onGenerate3D, spriteQuotaExhausted, onGenerateSprite }: CharacterCardProps) {
  const [editingStats, setEditingStats] = useState(false);
  const isGenerating =
    character.jobStatus === 'queued' || character.jobStatus === 'processing';
  const isDone = character.jobStatus === 'complete';
  const isFailed = character.jobStatus === 'failed';

  const progressPct = character.jobProgress ?? 0;

  return (
    <div className="character-card">
      <div className="character-card-header">
        <div className="character-card-identity">
          <span className="character-type-badge">{character.type}</span>
          <span className="character-name">{character.name}</span>
        </div>
        <button
          type="button"
          className="ghost character-remove-btn"
          onClick={() => onRemove(character.id)}
          aria-label={`Remove ${character.name}`}
        >
          ×
        </button>
      </div>

      {character.description && (
        <p className="character-description">{character.description}</p>
      )}

      {/* Stats inline */}
      <div className="character-stats">
        {editingStats ? (
          <>
            <label className="character-stat-label">
              HP
              <input
                type="number"
                className="wizard-input character-stat-input"
                min={1}
                value={character.stats.hp}
                onChange={(e) =>
                  onUpdate(character.id, { stats: { ...character.stats, hp: Number(e.target.value) } })
                }
              />
            </label>
            <label className="character-stat-label">
              Spd
              <input
                type="number"
                className="wizard-input character-stat-input"
                min={1}
                value={character.stats.speed}
                onChange={(e) =>
                  onUpdate(character.id, { stats: { ...character.stats, speed: Number(e.target.value) } })
                }
              />
            </label>
            <label className="character-stat-label">
              Dmg
              <input
                type="number"
                className="wizard-input character-stat-input"
                min={0}
                value={character.stats.damage}
                onChange={(e) =>
                  onUpdate(character.id, { stats: { ...character.stats, damage: Number(e.target.value) } })
                }
              />
            </label>
            <button
              type="button"
              className="ghost"
              onClick={() => setEditingStats(false)}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <span className="character-stat-pill">HP {character.stats.hp}</span>
            <span className="character-stat-pill">Spd {character.stats.speed}</span>
            <span className="character-stat-pill">Dmg {character.stats.damage}</span>
            <button
              type="button"
              className="ghost character-edit-stats-btn"
              onClick={() => setEditingStats(true)}
            >
              Edit stats
            </button>
          </>
        )}
      </div>

      {/* 3D model section */}
      {gameType !== '2D' && gameType !== 'Mobile-2D' && <div className="character-3d-section">
        {isDone && character.assetUrl ? (
          <div className="character-3d-preview">
            <div className="character-3d-badge">3D model ready</div>
            <a
              href={safeHref(character.assetUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="character-3d-link"
            >
              View GLTF asset
            </a>
          </div>
        ) : isGenerating ? (
          <div className="character-3d-progress">
            <span className="wizard-spinner" aria-hidden />
            <span>
              {character.jobStatus === 'queued' ? 'Queued...' : `Processing ${progressPct}%`}
            </span>
            <div
              className="character-progress-bar"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="character-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : isFailed ? (
          <div className="character-3d-failed">
            <span>3D generation failed.</span>
            <button
              type="button"
              className="wizard-btn-secondary"
              onClick={() => onGenerate3D(character)}
            >
              Retry
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={() => onGenerate3D(character)}
            disabled={quotaExhausted}
            title={quotaExhausted ? 'Monthly 3D generation quota reached' : undefined}
          >
            Generate 3D model
          </button>
        )}
      </div>}

      {/* 2D sprite section */}
      <div className="character-2d-section">
        {character.spriteUrl ? (
          <div className="character-sprite-preview">
            <div className="character-sprite-badge">2D sprite ready</div>
            <img
              src={character.spriteUrl}
              alt={`${character.name} sprite`}
              className="character-sprite-img"
              width={128}
              height={128}
            />
          </div>
        ) : character.spriteGenerating ? (
          <div className="character-sprite-generating">
            <span className="wizard-spinner" aria-hidden />
            <span>Generating sprite...</span>
          </div>
        ) : character.spriteFailed ? (
          <div className="character-sprite-failed">
            <span>Sprite generation failed.</span>
            <button type="button" className="wizard-btn-secondary" onClick={() => onGenerateSprite(character)}>
              Retry
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="wizard-btn-secondary"
            onClick={() => onGenerateSprite(character)}
            disabled={spriteQuotaExhausted}
            title={spriteQuotaExhausted ? 'Monthly sprite generation quota reached' : undefined}
          >
            Generate 2D sprite
          </button>
        )}
      </div>
    </div>
  );
}
