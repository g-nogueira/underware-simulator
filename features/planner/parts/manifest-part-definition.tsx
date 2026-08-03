import { compilePartManifest, type PartManifest } from "@/lib/part-manifest.mjs";

import type { PartRendererProps } from "./contracts";
import type { PlannerItem } from "../model/types";
import {
  ChannelCapacityInspector,
  ManifestPartInspector,
} from "./part-inspector-sections";
import { definePart } from "./part-registry";

function createSvgManifestRenderer(manifest: PartManifest) {
  const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    manifest.visual.svg,
  )}`;

  function SvgManifestRenderer({ item }: PartRendererProps) {
    const isQuarterTurn = item.rotation % 180 !== 0;
    const logicalWidth = isQuarterTurn ? item.height : item.width;
    const logicalHeight = isQuarterTurn ? item.width : item.height;
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    const imageX = centerX - logicalWidth / 2;
    const imageY = centerY - logicalHeight / 2;

    return (
      <>
        <rect
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          className="manifest-part-hit-area"
        />
        <image
          href={imageUrl}
          x={imageX}
          y={imageY}
          width={logicalWidth}
          height={logicalHeight}
          preserveAspectRatio="none"
          transform={
            item.rotation === 0
              ? undefined
              : `rotate(${item.rotation} ${centerX} ${centerY})`
          }
          className="manifest-part-image"
        />
      </>
    );
  }

  SvgManifestRenderer.displayName = `ManifestPart_${manifest.id}`;
  return SvgManifestRenderer;
}

export function createManifestPartDefinition({
  manifest,
  definitionHash,
  origin,
  catalogVisible,
}: {
  manifest: PartManifest;
  definitionHash: `sha256:${string}`;
  origin: "build-time" | "runtime" | "plan";
  catalogVisible: boolean;
}) {
  const compiled = compilePartManifest(manifest);
  if (!compiled.ok) {
    throw new Error(
      `Invalid part manifest ${manifest.id}: ${compiled.issues
        .map((entry) => `${entry.path}: ${entry.message}`)
        .join("; ")}`,
    );
  }
  const part = compiled.part;
  const inspectors = [
    ManifestPartInspector,
    ...(part.print.capacity === "cable" ? [ChannelCapacityInspector] : []),
  ];

  return definePart({
    catalog: part.catalog,
    Renderer: createSvgManifestRenderer(manifest),
    InspectorSections: inspectors,
    defaults: part.defaults,
    availability: { systems: part.compatibleSystems },
    placement: {
      grid: "active-system",
      layer: part.placement.layer,
      resizing: "fixed",
      allowedRotations:
        part.allowedRotations as readonly PlannerItem["rotation"][],
      snapAnchorsMm: part.snapAnchorsMm,
    },
    appearance: { shadow: true },
    print: {
      strategy: "components",
      capacity: part.print.capacity,
      components: part.print.components,
    },
    manifest: {
      definitionHash,
      snapshot: part.manifest,
      origin,
      catalogVisible,
    },
  });
}
