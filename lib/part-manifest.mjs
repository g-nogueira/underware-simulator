export const PART_MANIFEST_API_VERSION = "underware.parts/v1alpha1";

const MAX_SVG_CHARACTERS = 100_000;
const ALLOWED_ROTATIONS = new Set([0, 90, 180, 270]);
const ALLOWED_CAPABILITIES = Object.freeze({
  renderer: new Set(["svg/v1"]),
  sizing: new Set(["fixed/v1"]),
  print: new Set(["components/v1"]),
  capacity: new Set(["none/v1", "system-cable/v1"]),
});
const ALLOWED_SVG_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function almostEqual(left, right, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance;
}

function issue(path, code, message) {
  return { path, code, message };
}

function validateSvg(svg, declaredViewBox, sizeMm) {
  const issues = [];
  if (typeof svg !== "string" || !svg.trim()) {
    return [issue("visual.svg", "required", "An inline SVG is required")];
  }
  if (svg.length > MAX_SVG_CHARACTERS) {
    issues.push(
      issue(
        "visual.svg",
        "too_large",
        `SVG must be at most ${MAX_SVG_CHARACTERS.toLocaleString()} characters`,
      ),
    );
  }
  if (/<!doctype|<!entity/i.test(svg)) {
    issues.push(
      issue("visual.svg", "unsafe_xml", "DOCTYPE and ENTITY declarations are forbidden"),
    );
  }
  if (/\bon[a-z]+\s*=/i.test(svg)) {
    issues.push(
      issue("visual.svg", "event_handler", "SVG event-handler attributes are forbidden"),
    );
  }
  if (/\b(?:href|xlink:href|style)\s*=/i.test(svg) || /url\s*\(/i.test(svg)) {
    issues.push(
      issue(
        "visual.svg",
        "external_or_styled_content",
        "SVG links, style attributes, and URL paint servers are forbidden",
      ),
    );
  }

  const elementPattern = /<\/?\s*([a-zA-Z][\w:-]*)\b/g;
  for (const match of svg.matchAll(elementPattern)) {
    const name = match[1].toLowerCase();
    if (!ALLOWED_SVG_ELEMENTS.has(name)) {
      issues.push(
        issue(
          "visual.svg",
          "unsupported_element",
          `SVG element <${name}> is not supported`,
        ),
      );
      break;
    }
  }

  const rootViewBox = svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!rootViewBox) {
    issues.push(issue("visual.svg", "missing_viewbox", "The root SVG needs a viewBox"));
  } else {
    const parsed = rootViewBox[1].trim().split(/[\s,]+/).map(Number);
    if (
      parsed.length !== 4 ||
      parsed.some((value) => !Number.isFinite(value)) ||
      declaredViewBox.some((value, index) => !almostEqual(value, parsed[index]))
    ) {
      issues.push(
        issue(
          "visual.svg",
          "viewbox_mismatch",
          "The SVG viewBox must match visual.viewBoxMm exactly",
        ),
      );
    }
  }

  if (
    declaredViewBox.length === 4 &&
    (!almostEqual(declaredViewBox[0], 0) ||
      !almostEqual(declaredViewBox[1], 0) ||
      !almostEqual(declaredViewBox[2], sizeMm.x) ||
      !almostEqual(declaredViewBox[3], sizeMm.y))
  ) {
    issues.push(
      issue(
        "visual.viewBoxMm",
        "physical_scale_mismatch",
        "The SVG viewBox must be [0, 0, physical width, physical depth] in millimetres",
      ),
    );
  }

  return issues;
}

/**
 * Candidate v1alpha1 semantic validator for the JSON-parts spike.
 * JSON Schema owns structural validation in the proposed production design;
 * these checks cover cross-field dimensional invariants and the SVG allowlist.
 */
export function validatePartManifest(value) {
  const issues = [];
  const warnings = [];

  if (!isObject(value)) {
    return {
      ok: false,
      issues: [issue("$", "type", "Part manifest must be a JSON object")],
      warnings,
    };
  }

  if (value.apiVersion !== PART_MANIFEST_API_VERSION) {
    issues.push(
      issue(
        "apiVersion",
        "unsupported_version",
        `Expected ${PART_MANIFEST_API_VERSION}`,
      ),
    );
  }
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(value.id)) {
    issues.push(
      issue(
        "id",
        "invalid_id",
        "Use a stable lowercase ID containing letters, digits, dots, underscores, or hyphens",
      ),
    );
  }
  if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version)) {
    issues.push(issue("version", "invalid_version", "Version must use semantic versioning"));
  }

  if (!isObject(value.metadata)) {
    issues.push(issue("metadata", "required", "Catalogue metadata is required"));
  } else {
    for (const field of ["name", "category", "description"]) {
      if (typeof value.metadata[field] !== "string" || !value.metadata[field].trim()) {
        issues.push(issue(`metadata.${field}`, "required", `${field} is required`));
      }
    }
    const source = value.metadata.source;
    if (!isObject(source) || typeof source.url !== "string") {
      issues.push(issue("metadata.source.url", "required", "A source page URL is required"));
    } else {
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:") throw new Error("protocol");
      } catch {
        issues.push(
          issue("metadata.source.url", "invalid_url", "Source URL must be an HTTPS URL"),
        );
      }
    }
    if (!isObject(value.metadata.license) || value.metadata.license.status === "unknown") {
      warnings.push(
        issue(
          "metadata.license",
          "license_unverified",
          "Verify the creator's current licence before downloading or printing",
        ),
      );
    }
  }

  const sizeMm = value.physical?.sizeMm;
  if (value.physical?.units !== "mm") {
    issues.push(
      issue("physical.units", "unit_invariant", "Physical dimensions must be expressed in mm"),
    );
  }
  if (!isObject(sizeMm)) {
    issues.push(issue("physical.sizeMm", "required", "Physical X/Y/Z dimensions are required"));
  } else {
    for (const axis of ["x", "y", "z"]) {
      if (!isPositiveNumber(sizeMm[axis])) {
        issues.push(
          issue(`physical.sizeMm.${axis}`, "positive_number", `${axis} must be positive`),
        );
      }
    }
  }

  const placement = value.placement;
  if (!isObject(placement) || placement.resizing !== "fixed") {
    issues.push(
      issue(
        "placement.resizing",
        "fixed_size_required",
        "v1alpha1 accepts only fixed-size printable variants",
      ),
    );
  }
  if (
    !Array.isArray(placement?.allowedRotations) ||
    !placement.allowedRotations.length ||
    placement.allowedRotations.some((rotation) => !ALLOWED_ROTATIONS.has(rotation)) ||
    new Set(placement?.allowedRotations).size !== placement?.allowedRotations.length
  ) {
    issues.push(
      issue(
        "placement.allowedRotations",
        "invalid_rotations",
        "Use unique rotations selected from 0, 90, 180, and 270 degrees",
      ),
    );
  }

  if (!Array.isArray(value.mounting) || !value.mounting.length) {
    issues.push(
      issue("mounting", "required", "Declare at least one compatible mounting system"),
    );
  } else {
    for (const [index, mounting] of value.mounting.entries()) {
      if (!isObject(mounting) || !["openGrid", "underware"].includes(mounting.system)) {
        issues.push(
          issue(`mounting.${index}.system`, "unsupported_system", "Unsupported mounting system"),
        );
      }
      if (!isObject(mounting?.snapAnchorMm)) {
        issues.push(
          issue(`mounting.${index}.snapAnchorMm`, "required", "A millimetre snap anchor is required"),
        );
      } else if (
        !Number.isFinite(mounting.snapAnchorMm.x) ||
        !Number.isFinite(mounting.snapAnchorMm.y)
      ) {
        issues.push(
          issue(
            `mounting.${index}.snapAnchorMm`,
            "finite_anchor",
            "Snap-anchor coordinates must be finite millimetre values",
          ),
        );
      }
    }
  }

  if (!isObject(value.capabilities)) {
    issues.push(issue("capabilities", "required", "Capability identifiers are required"));
  } else {
    for (const [kind, allowed] of Object.entries(ALLOWED_CAPABILITIES)) {
      if (!allowed.has(value.capabilities[kind])) {
        issues.push(
          issue(
            `capabilities.${kind}`,
            "unsupported_capability",
            `Unsupported ${kind} capability`,
          ),
        );
      }
    }
  }

  const visual = value.visual;
  const viewBox = Array.isArray(visual?.viewBoxMm) ? visual.viewBoxMm : [];
  if (visual?.type !== "svg" || visual?.coordinateSpace !== "physical-mm") {
    issues.push(
      issue(
        "visual",
        "physical_svg_required",
        "Use an SVG in the physical-mm coordinate space",
      ),
    );
  }
  if (viewBox.length !== 4 || viewBox.some((number) => !Number.isFinite(number))) {
    issues.push(issue("visual.viewBoxMm", "invalid_viewbox", "viewBoxMm needs four numbers"));
  }
  if (isObject(sizeMm) && viewBox.length === 4) {
    issues.push(...validateSvg(visual.svg, viewBox, sizeMm));
  }

  if (!Array.isArray(value.print?.components) || !value.print.components.length) {
    issues.push(
      issue("print.components", "required", "Declare the physical files/components to print"),
    );
  } else {
    for (const [index, component] of value.print.components.entries()) {
      if (
        !isObject(component) ||
        typeof component.name !== "string" ||
        !Number.isInteger(component.quantity) ||
        component.quantity <= 0
      ) {
        issues.push(
          issue(
            `print.components.${index}`,
            "invalid_component",
            "Each print component needs a name and positive integer quantity",
          ),
        );
      }
    }
  }

  return issues.length
    ? { ok: false, issues, warnings }
    : { ok: true, manifest: value, issues: [], warnings };
}

export function compilePartManifest(value) {
  const result = validatePartManifest(value);
  if (!result.ok) return result;
  const manifest = result.manifest;
  return {
    ...result,
    part: Object.freeze({
      catalog: Object.freeze({
        id: manifest.id,
        kind: "part",
        name: manifest.metadata.name,
        icon: manifest.metadata.icon ?? "◇",
        category: manifest.metadata.category,
        description: manifest.metadata.description,
        widthCells: 1,
        heightCells: 1,
        footprintMm: Object.freeze({
          width: manifest.physical.sizeMm.x,
          height: manifest.physical.sizeMm.y,
        }),
      }),
      physicalHeightMm: manifest.physical.sizeMm.z,
      allowedRotations: Object.freeze([...manifest.placement.allowedRotations]),
      compatibleSystems: Object.freeze(
        manifest.mounting.map((mounting) => mounting.system),
      ),
      placement: Object.freeze({
        grid: "active-system",
        layer: manifest.placement.defaultLayer,
        resizing: "fixed",
      }),
      print: Object.freeze({
        strategy: "components",
        capacity:
          manifest.capabilities.capacity === "system-cable/v1" ? "cable" : "none",
        components: Object.freeze(
          manifest.print.components.map((component) => Object.freeze({ ...component })),
        ),
      }),
      visual: Object.freeze({
        svg: manifest.visual.svg,
        viewBoxMm: Object.freeze([...manifest.visual.viewBoxMm]),
      }),
      source: Object.freeze({ ...manifest.metadata.source }),
      version: manifest.version,
    }),
  };
}
