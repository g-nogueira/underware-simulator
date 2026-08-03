import type { PartManifest } from "@/lib/part-manifest.mjs";
import straightChannelManifest from "@/spikes/json-parts/examples/straight-channel.part.json";

/**
 * Release-owned manifests are imported and validated during normal builds.
 * The literal hashes are regression-checked against canonical manifest bytes.
 */
export const BUILD_TIME_MANIFESTS = [
  {
    hash: "sha256:436313035d6279903f7f0668ec6d2249d3c11b4deb21823f5c84512c7db3c06d",
    manifest: straightChannelManifest as PartManifest,
  },
] as const;
