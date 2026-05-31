// SPDX-License-Identifier: Apache-2.0

export const PRO_MODULE_BUNDLE_FORMAT = 'agds-pro-module-bundle/v1';

export type ProModuleMountKind = 'skill' | 'game-art-bible' | 'engine-target';

export interface ProModuleMountDescriptor {
  kind: ProModuleMountKind;
  id: string;
  title?: string;
  description?: string;
  entry?: string;
  digestSha256?: string;
}

export interface ProModuleManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  licenseTier?: string;
  minAgdsVersion?: string;
  mounts: {
    skills?: ProModuleMountDescriptor[];
    gameArtBibles?: ProModuleMountDescriptor[];
    engineTargets?: ProModuleMountDescriptor[];
  };
}

export interface ProModuleBundleSignature {
  algorithm: 'ed25519';
  keyId: string;
  value: string;
  signedFields?: 'format+manifest+payloadSha256';
}

export interface ProModuleBundleEnvelope {
  format: typeof PRO_MODULE_BUNDLE_FORMAT;
  manifest: ProModuleManifest;
  payloadSha256: string;
  encryptedPayload?: string;
  signature?: ProModuleBundleSignature;
}

export interface VerifiedProModuleManifest {
  manifest: ProModuleManifest;
  payloadSha256: string;
  signature: {
    algorithm: 'ed25519';
    keyId: string;
  };
}

export type ProjectProModuleStatus = 'licensed' | 'license-required';

export interface ProjectProModuleMountedDescriptors {
  skills: ProModuleMountDescriptor[];
  gameArtBibles: ProModuleMountDescriptor[];
  engineTargets: ProModuleMountDescriptor[];
}

export interface ProjectProModuleRuntimeRegistryEntry {
  kind: ProModuleMountKind;
  id: string;
  source: 'pro-module';
  moduleId: string;
  moduleName: string;
  moduleVersion: string;
  fileName: string;
  digestSha256: string;
  title?: string;
  description?: string;
  entry?: string;
  mediaType?: string;
}

export interface ProjectProModuleRuntimeRegistries {
  skills: ProjectProModuleRuntimeRegistryEntry[];
  gameArtBibles: ProjectProModuleRuntimeRegistryEntry[];
  engineTargets: ProjectProModuleRuntimeRegistryEntry[];
}

export interface ProjectProModuleSummary extends VerifiedProModuleManifest {
  fileName: string;
  status: ProjectProModuleStatus;
  mountCount: number;
  mounted?: ProjectProModuleMountedDescriptors;
}

export interface ProjectProModuleRejectedSummary {
  fileName: string;
  code: string;
  message: string;
}

export interface ProjectProModulesResponse {
  projectId: string;
  trustedKeyCount: number;
  modules: ProjectProModuleSummary[];
  registries: ProjectProModuleRuntimeRegistries;
  rejected: ProjectProModuleRejectedSummary[];
}

export interface ProjectProModuleRegistryItemResponse {
  projectId: string;
  kind: ProModuleMountKind;
  item: ProjectProModuleRuntimeRegistryEntry;
  body: string;
}

export interface ProModuleActivationConfigResponse {
  cloudUrl: string;
  licenseKeyConfigured: boolean;
  licenseKeyMask: string;
  entitlementLookupKeyConfigured: boolean;
  entitlementLookupKeyMask: string;
  entitlementLookupKeyCount: number;
}

export interface UpdateProModuleActivationConfigRequest {
  cloudUrl?: string;
  licenseKey?: string;
  entitlementLookupKey?: string;
  clearLicenseKey?: boolean;
  clearEntitlementLookupKeys?: boolean;
}
