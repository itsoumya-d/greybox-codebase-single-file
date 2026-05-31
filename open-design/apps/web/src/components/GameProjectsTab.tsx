import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { deleteLiveArtifact, fetchLiveArtifacts } from "../providers/registry";
import type {
	GameArtBibleSummary,
	LiveArtifactSummary,
	Project,
	ProjectDisplayStatus,
	SkillSummary,
} from "../types";
import { Icon } from "./Icon";
import { LiveArtifactBadges } from "./LiveArtifactBadges";

type SubTab = "recent" | "yours";
type ViewMode = "grid" | "kanban";

type GameProjectListItem =
	| { type: "project"; project: Project; updatedAt: number; createdAt: number }
	| {
			type: "live-artifact";
			project: Project;
			liveArtifact: LiveArtifactSummary;
			updatedAt: number;
			createdAt: number;
	  };

const GAME_PROJECTS_VIEW_STORAGE_KEY = "agds:game-projects:view";

export const STATUS_ORDER = [
	"not_started",
	"running",
	"awaiting_input",
	"succeeded",
	"failed",
	"canceled",
] as const satisfies readonly ProjectDisplayStatus[];

export const STATUS_LABEL_KEYS = {
	not_started: "gameProjects.status.notStarted",
	queued: "gameProjects.status.queued",
	running: "gameProjects.status.running",
	awaiting_input: "gameProjects.status.awaitingInput",
	succeeded: "gameProjects.status.succeeded",
	failed: "gameProjects.status.failed",
	canceled: "gameProjects.status.canceled",
} as const satisfies Record<
	ProjectDisplayStatus,
	Parameters<ReturnType<typeof useT>>[0]
>;

interface Props {
	projects: Project[];
	skills: SkillSummary[];
	gameArtBibles: GameArtBibleSummary[];
	onOpen: (id: string) => void;
	onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
	onDelete: (id: string) => void;
}

export function GameProjectsTab({
	projects,
	skills,
	gameArtBibles,
	onOpen,
	onOpenLiveArtifact,
	onDelete,
}: Props) {
	const t = useT();
	const [filter, setFilter] = useState("");
	const [sub, setSub] = useState<SubTab>("recent");
	const [liveArtifactsByProject, setLiveArtifactsByProject] = useState<
		Record<string, LiveArtifactSummary[]>
	>({});
	const [view, setView] = useState<ViewMode>(() => {
		if (typeof window === "undefined") return "grid";
		try {
			const storedView = window.localStorage.getItem(GAME_PROJECTS_VIEW_STORAGE_KEY);
			return storedView === "grid" || storedView === "kanban"
				? storedView
				: "grid";
		} catch {
			return "grid";
		}
	});

	useEffect(() => {
		let cancelled = false;
		const projectIds = projects.map((project) => project.id);
		if (projectIds.length === 0) {
			setLiveArtifactsByProject({});
			return;
		}

		void Promise.all(
			projectIds.map(
				async (projectId) =>
					[projectId, await fetchLiveArtifacts(projectId)] as const,
			),
		).then((entries) => {
			if (cancelled) return;
			setLiveArtifactsByProject(Object.fromEntries(entries));
		});

		return () => {
			cancelled = true;
		};
	}, [projects]);

	useEffect(() => {
		try {
			window.localStorage.setItem(GAME_PROJECTS_VIEW_STORAGE_KEY, view);
		} catch {}
	}, [view]);

	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase();
		let list: GameProjectListItem[] = projects
			.filter(
				(project) =>
					!shouldHideProjectCard(
						project,
						liveArtifactsByProject[project.id] ?? [],
					),
			)
			.map((project) => ({
				type: "project",
				project,
				updatedAt: project.updatedAt,
				createdAt: project.createdAt,
			}));

		const liveItems = projects.flatMap((project) =>
			(liveArtifactsByProject[project.id] ?? []).map((liveArtifact) => ({
				type: "live-artifact" as const,
				project,
				liveArtifact,
				updatedAt: Date.parse(liveArtifact.updatedAt) || project.updatedAt,
				createdAt: Date.parse(liveArtifact.createdAt) || project.createdAt,
			})),
		);

		list = [...list, ...liveItems];

		if (sub === "recent") {
			list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
		}

		if (sub === "yours") {
			list = [...list].sort((a, b) => b.createdAt - a.createdAt);
		}

		if (!q) return list;
		return list.filter((item) => {
			if (item.project.name.toLowerCase().includes(q)) return true;
			return (
				item.type === "live-artifact" &&
				item.liveArtifact.title.toLowerCase().includes(q)
			);
		});
	}, [projects, liveArtifactsByProject, filter, sub]);

	const filteredProjects = useMemo(
		() =>
			filtered.filter(
				(item): item is Extract<GameProjectListItem, { type: "project" }> =>
					item.type === "project",
			),
		[filtered],
	);

	const skillName = (id: string | null) =>
		skills.find((s) => s.id === id)?.name ?? "";
	const gameArtBibleName = (id: string | null) =>
		gameArtBibles.find((d) => d.id === id)?.title ?? "";
	const handleDeleteLiveArtifact = async (
		projectId: string,
		artifact: LiveArtifactSummary,
	) => {
		if (!confirm(`${t("common.delete")} "${artifact.title}"?`)) return;
		const ok = await deleteLiveArtifact(projectId, artifact.id);
		if (!ok) return;
		setLiveArtifactsByProject((current) => ({
			...current,
			[projectId]: (current[projectId] ?? []).filter(
				(candidate) => candidate.id !== artifact.id,
			),
		}));
	};

	return (
		<div
			className={`tab-panel${view === "kanban" ? " game-projects-kanban-view" : ""}`}
		>
			<div className="tab-panel-toolbar">
				<div className="toolbar-left">
					<div
						className="subtab-pill"
						role="group"
						aria-label={t("gameProjects.filterAria")}
					>
						<button
							aria-pressed={sub === "recent"}
							className={sub === "recent" ? "active" : ""}
							onClick={() => setSub("recent")}
						>
							{t("gameProjects.subRecent")}
						</button>
						<button
							aria-pressed={sub === "yours"}
							className={sub === "yours" ? "active" : ""}
							onClick={() => setSub("yours")}
						>
							{t("gameProjects.subYours")}
						</button>
					</div>
				</div>
				<div className="toolbar-right">
					<div className="toolbar-search">
						<span className="search-icon" aria-hidden>
							<Icon name="search" size={13} />
						</span>
						<input
							placeholder={t("gameProjects.searchPlaceholder")}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
						/>
					</div>
					<div
						className="subtab-pill"
						role="group"
						aria-label={t("gameProjects.viewToggleAria")}
					>
						<button
							aria-pressed={view === "grid"}
							className={view === "grid" ? "active" : ""}
							onClick={() => setView("grid")}
							title={t("gameProjects.viewGrid")}
							data-testid="game-projects-view-grid"
						>
							<Icon name="grid" size={14} />
						</button>
						<button
							aria-pressed={view === "kanban"}
							className={view === "kanban" ? "active" : ""}
							onClick={() => setView("kanban")}
							title={t("gameProjects.viewKanban")}
							data-testid="game-projects-view-kanban"
						>
							<Icon name="kanban" size={14} />
						</button>
					</div>
				</div>
			</div>
			{filtered.length === 0 ? (
				<div className="tab-empty">
					{projects.length === 0
						? t("gameProjects.emptyNoProjects")
						: t("gameProjects.emptyNoMatch")}
				</div>
			) : view === "grid" ? (
				<div className="game-projects-grid">
					{filtered.map((item) => {
						const p = item.project;
						const skill = skillName(p.skillId);
							const artBible = gameArtBibleName(p.gameArtBibleId ?? null);
						if (item.type === "live-artifact") {
							const artifact = item.liveArtifact;
							const title = liveArtifactCardTitle(p, artifact);
							const metaLead = liveArtifactCardMetaLead(p, artifact);
							return (
								<div
									key={`live:${artifact.id}`}
									className={`game-project-card live-artifact-card status-${artifact.status} refresh-${artifact.refreshStatus}`}
									role="button"
									tabIndex={0}
									onClick={() => onOpenLiveArtifact(p.id, artifact.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onOpenLiveArtifact(p.id, artifact.id);
										}
									}}
								>
									<button
										type="button"
										className="game-project-card-close"
										title={t("common.delete")}
										aria-label={`${t("common.delete")} ${artifact.title}`}
										onClick={(e) => {
											e.stopPropagation();
											void handleDeleteLiveArtifact(p.id, artifact);
										}}
									>
										<Icon name="close" size={12} />
									</button>
									<div
										className="game-project-card-thumb live-artifact-thumb"
										aria-hidden
									>
										<span className="live-artifact-thumb-glyph">●</span>
									</div>
									<div className="game-project-card-meta-block">
										<LiveArtifactBadges
											className="game-project-card-badges"
											status={artifact.status}
											refreshStatus={artifact.refreshStatus}
										/>
										<div className="game-project-card-name" title={title}>
											{title}
										</div>
										<div className="game-project-card-meta">
											<span className="art-bible">{metaLead}</span>
											{" · "}
											{artifactStatusLabel(
												artifact.status,
												artifact.refreshStatus,
												t,
											)}
											{" · "}
											{sub === "recent"
												? relativeTime(item.updatedAt, t)
												: relativeTime(item.createdAt, t)}
										</div>
									</div>
								</div>
							);
						}

						const liveCount = liveArtifactsByProject[p.id]?.length ?? 0;
						const status = p.status?.value ?? "not_started";
						return (
							<div
								key={p.id}
								className="game-project-card"
								role="button"
								tabIndex={0}
								onClick={() => onOpen(p.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onOpen(p.id);
									}
								}}
							>
								<button
									className="game-project-card-close"
									title={t("gameProjects.deleteTitle")}
									aria-label={t("gameProjects.deleteAria", { name: p.name })}
									onClick={(e) => {
										e.stopPropagation();
										if (confirm(t("gameProjects.deleteConfirm", { name: p.name })))
											onDelete(p.id);
									}}
								>
									<Icon name="close" size={12} />
								</button>
								<div className="game-project-card-thumb" aria-hidden>
									{liveCount > 0 ? (
										<span className="game-project-live-count">
											{t("gameProjects.liveCount", { n: liveCount })}
										</span>
									) : null}
								</div>
								<div className="game-project-card-meta-block">
									<div className="game-project-card-name" title={p.name}>
										{p.name}
									</div>
									<div className="game-project-card-meta">
										{artBible ? (
											<span className="art-bible">{artBible}</span>
										) : (
											<span>{t("gameProjects.cardFreeform")}</span>
										)}
										{skill ? ` · ${skill}` : ""}
										{" · "}
										<span
											className={`game-project-card-status game-project-card-status-${status}`}
										>
											{statusLabel(status, t)}
										</span>
										{sub === "recent"
											? ` · ${relativeTime(p.updatedAt, t)}`
											: sub === "yours"
												? ` · ${relativeTime(p.createdAt, t)}`
												: ""}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="game-projects-kanban-board">
					{STATUS_ORDER.map((status) => {
						const colProjects = filteredProjects.filter(
							(item) =>
								normalizeStatus(item.project.status?.value ?? "not_started") ===
								status,
						);
						return (
							<div key={status} className="game-projects-kanban-col">
								<div className="game-projects-kanban-header">
									<span>{statusLabel(status, t)}</span>
									<span className="game-projects-kanban-count">
										{colProjects.length}
									</span>
								</div>
								<div className="game-projects-kanban-list">
									{colProjects.length === 0 ? (
										<div className="game-projects-kanban-empty">
											{t("gameProjects.kanbanEmptyColumn")}
										</div>
									) : (
										colProjects.map(({ project: p }) => {
											const skill = skillName(p.skillId);
												const artBible = gameArtBibleName(p.gameArtBibleId ?? null);
											return (
												<div
													key={p.id}
													className={`game-projects-kanban-card status-${status}`}
													role="button"
													tabIndex={0}
													onClick={() => onOpen(p.id)}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															onOpen(p.id);
														}
													}}
												>
													<button
														className="game-project-card-close"
														title={t("gameProjects.deleteTitle")}
														aria-label={t("gameProjects.deleteAria", {
															name: p.name,
														})}
														onClick={(e) => {
															e.stopPropagation();
															if (
																confirm(
																	t("gameProjects.deleteConfirm", { name: p.name }),
																)
															)
																onDelete(p.id);
														}}
													>
														<Icon name="close" size={12} />
													</button>
													<div
														className="game-projects-kanban-card-name"
														title={p.name}
													>
														{p.name}
													</div>
													<div className="game-projects-kanban-card-meta">
														{artBible ? (
															<span className="art-bible">{artBible}</span>
														) : (
															<span>{t("gameProjects.cardFreeform")}</span>
														)}
														{skill ? ` · ${skill}` : ""}
														{sub === "recent"
															? ` · ${relativeTime(p.updatedAt, t)}`
															: sub === "yours"
																? ` · ${relativeTime(p.createdAt, t)}`
																: ""}
													</div>
												</div>
											);
										})
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function normalizeStatus(
	status: ProjectDisplayStatus,
): Exclude<ProjectDisplayStatus, "queued"> {
	return status === "queued" ? "running" : status;
}

function statusLabel(
	status: ProjectDisplayStatus,
	t: ReturnType<typeof useT>,
): string {
	return t(STATUS_LABEL_KEYS[status]);
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
	const diff = Date.now() - ts;
	const min = 60_000;
	const hr = 60 * min;
	const day = 24 * hr;
	if (diff < min) return t("common.justNow");
	if (diff < hr) return t("common.minutesAgo", { n: Math.floor(diff / min) });
	if (diff < day) return t("common.hoursAgo", { n: Math.floor(diff / hr) });
	if (diff < 7 * day) return t("common.daysAgo", { n: Math.floor(diff / day) });
	return new Date(ts).toLocaleDateString();
}

function artifactStatusLabel(
	status: LiveArtifactSummary["status"],
	refreshStatus: LiveArtifactSummary["refreshStatus"],
	t: ReturnType<typeof useT>,
): string {
	if (status === "archived") return t("gameProjects.statusArchived");
	if (status === "error") return t("gameProjects.statusError");
	if (refreshStatus === "running") return t("gameProjects.statusRefreshing");
	if (refreshStatus === "failed") return t("gameProjects.statusRefreshFailed");
	if (refreshStatus === "succeeded") return t("gameProjects.statusRefreshed");
	return t("gameProjects.statusLive");
}

function shouldHideProjectCard(project: Project, liveArtifacts: LiveArtifactSummary[]): boolean {
  if (liveArtifacts.length === 0) return false;
  return project.skillId === 'live-artifact' && isOrbitProject(project);
}

function liveArtifactCardTitle(project: Project, liveArtifact: LiveArtifactSummary): string {
  return isCollapsedOrbitArtifactProject(project) ? project.name : liveArtifact.title;
}

function liveArtifactCardMetaLead(project: Project, liveArtifact: LiveArtifactSummary): string {
  return isCollapsedOrbitArtifactProject(project) ? liveArtifact.title : project.name;
}

function isCollapsedOrbitArtifactProject(project: Project): boolean {
  return project.skillId === 'live-artifact' && isOrbitProject(project);
}

function isOrbitProject(project: Project): boolean {
  const metadata = project.metadata as { kind?: unknown } | undefined;
  return metadata?.kind === 'orbit';
}
