import type { PartManifest } from "@/lib/part-manifest.mjs";

import cableLoopManifest from "./manifests/cable-loop.part.json";
import deviceHolderManifest from "./manifests/device-holder.part.json";
import lChannelManifest from "./manifests/l-channel.part.json";
import openGridBaseplateManifest from "./manifests/opengrid-baseplate.part.json";
import powerBrickMountManifest from "./manifests/power-brick-mount.part.json";
import sChannelManifest from "./manifests/s-channel.part.json";
import straightChannelManifest from "./manifests/straight-channel.part.json";
import tChannelManifest from "./manifests/t-channel.part.json";
import xChannelManifest from "./manifests/x-channel.part.json";

/**
 * Existing schematic/parametric catalogue entries are release-owned JSON too.
 * Their compiler keeps native behaviours behind finite capability identifiers
 * and makes their generator-required dimensional status explicit.
 */
export const RELEASE_PART_MANIFESTS = [
  openGridBaseplateManifest,
  lChannelManifest,
  tChannelManifest,
  xChannelManifest,
  sChannelManifest,
  cableLoopManifest,
  deviceHolderManifest,
  powerBrickMountManifest,
] as const;

/**
 * Exact printable variants share the public importer/compiler contract.
 * Literal hashes are regression-checked against canonical manifest bytes.
 */
export const BUILD_TIME_MANIFESTS = [
  {
    hash: "sha256:43593666c9f9a1d42f4d1acb0c7fa9bc484f06131a603d462a826df66c933e2a",
    manifest: straightChannelManifest as PartManifest,
    legacyKind: "channel" as const,
  },
] as const;
