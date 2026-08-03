export const PART_MANIFEST_API_VERSION = "underware.parts/v1alpha1";

const MAX_SVG_CHARACTERS = 100_000;
const MAX_PHYSICAL_MM = 10_000;
const MAX_SVG_ELEMENTS = 2_000;
const MAX_PATH_CHARACTERS = 50_000;
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
const ALLOWED_SVG_ATTRIBUTES = new Set([
  "xmlns",
  "viewBox",
  "transform",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "d",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "vector-effect",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0 && value <= MAX_PHYSICAL_MM;
}

function almostEqual(left, right, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance;
}

function issue(path, code, message) {
  return { path, code, message };
}

function validateKeys(value, allowedKeys, path, issues) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push(
        issue(
          path === "$" ? `$.${key}` : `${path}.${key}`,
          "unknown_property",
          `Unknown property: ${key}`,
        ),
      );
    }
  }
}

function validatePoint(point, path, sizeMm, issues) {
  if (!isObject(point)) {
    issues.push(issue(path, "required", "A millimetre point is required"));
    return;
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    issues.push(
      issue(path, "finite_point", "Point coordinates must be finite millimetre values"),
    );
    return;
  }
  if (
    isObject(sizeMm) &&
    (point.x < 0 || point.y < 0 || point.x > sizeMm.x || point.y > sizeMm.y)
  ) {
    issues.push(
      issue(path, "point_outside_footprint", "Point must lie inside the physical X/Y footprint"),
    );
  }
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  );
}

export function canonicalizePartManifest(value) {
  return JSON.stringify(canonicalizeJson(value));
}

export async function hashPartManifest(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 is unavailable in this browser");
  }
  const bytes = new TextEncoder().encode(canonicalizePartManifest(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
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
  if (/<!|<\?/i.test(svg)) {
    issues.push(
      issue("visual.svg", "unsafe_xml", "XML declarations, directives, and comments are forbidden"),
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

  if (/javascript\s*:|data\s*:/i.test(svg)) {
    issues.push(
      issue("visual.svg", "unsafe_protocol", "Script and nested data protocols are forbidden"),
    );
  }

  const elementPattern = /<\/?\s*([a-zA-Z][\w:-]*)\b/g;
  const elementMatches = [...svg.matchAll(elementPattern)];
  const rootMatches = [...svg.matchAll(/<svg\b/gi)];
  if (
    rootMatches.length !== 1 ||
    !svg.trimStart().startsWith("<svg") ||
    !svg.trimEnd().endsWith("</svg>")
  ) {
    issues.push(
      issue("visual.svg", "invalid_root", "SVG must contain exactly one root <svg> document"),
    );
  }
  if (elementMatches.length > MAX_SVG_ELEMENTS) {
    issues.push(
      issue("visual.svg", "too_complex", `SVG may contain at most ${MAX_SVG_ELEMENTS} elements`),
    );
  }
  for (const match of elementMatches) {
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

  const startTagPattern = /<([a-zA-Z][\w:-]*)([^<>]*?)(?:\/?)>/g;
  for (const tag of svg.matchAll(startTagPattern)) {
    const attributes = tag[2];
    const attributePattern = /([^\s=]+)\s*=\s*(["'])(.*?)\2/g;
    const attributeNames = new Set();
    for (const attribute of attributes.matchAll(attributePattern)) {
      const name = attribute[1];
      const value = attribute[3];
      if (attributeNames.has(name)) {
        issues.push(
          issue("visual.svg", "duplicate_attribute", `SVG attribute ${name} is duplicated`),
        );
        break;
      }
      attributeNames.add(name);
      if (!ALLOWED_SVG_ATTRIBUTES.has(name)) {
        issues.push(
          issue("visual.svg", "unsupported_attribute", `SVG attribute ${name} is not supported`),
        );
        break;
      }
      if (/url\s*\(|javascript\s*:|data\s*:/i.test(value)) {
        issues.push(
          issue("visual.svg", "unsafe_attribute", `SVG attribute ${name} contains unsafe content`),
        );
        break;
      }
      if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") {
        issues.push(
          issue("visual.svg", "invalid_namespace", "SVG must use the standard SVG namespace"),
        );
        break;
      }
      if (name === "d" && value.length > MAX_PATH_CHARACTERS) {
        issues.push(
          issue("visual.svg", "path_too_complex", `One SVG path may contain at most ${MAX_PATH_CHARACTERS} characters`),
        );
        break;
      }
    }
    const remainder = attributes.replace(attributePattern, "").trim();
    if (remainder && remainder !== "/") {
      issues.push(
        issue("visual.svg", "malformed_attribute", "SVG attributes must use quoted values"),
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

  validateKeys(
    value,
    new Set([
      "$schema",
      "apiVersion",
      "id",
      "version",
      "metadata",
      "physical",
      "placement",
      "mounting",
      "ports",
      "capabilities",
      "defaults",
      "visual",
      "print",
    ]),
    "$",
    issues,
  );

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
    validateKeys(
      value.metadata,
      new Set(["name", "icon", "category", "description", "tags", "source", "license"]),
      "metadata",
      issues,
    );
    for (const field of ["name", "category", "description"]) {
      if (typeof value.metadata[field] !== "string" || !value.metadata[field].trim()) {
        issues.push(issue(`metadata.${field}`, "required", `${field} is required`));
      }
    }
    const source = value.metadata.source;
    if (!isObject(source) || typeof source.url !== "string") {
      issues.push(issue("metadata.source.url", "required", "A source page URL is required"));
    } else {
      validateKeys(
        source,
        new Set(["provider", "url", "modelId", "profileId", "creator", "artifactSha256"]),
        "metadata.source",
        issues,
      );
      if (!new Set(["makerworld", "local", "other"]).has(source.provider)) {
        issues.push(
          issue("metadata.source.provider", "unsupported_provider", "Use makerworld, local, or other"),
        );
      }
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:") throw new Error("protocol");
      } catch {
        issues.push(
          issue("metadata.source.url", "invalid_url", "Source URL must be an HTTPS URL"),
        );
      }
    }
    if (isObject(value.metadata.license)) {
      validateKeys(
        value.metadata.license,
        new Set(["status", "name", "spdxId", "sourceUrl"]),
        "metadata.license",
        issues,
      );
      if (!new Set(["declared", "unknown"]).has(value.metadata.license.status)) {
        issues.push(
          issue("metadata.license.status", "invalid_license", "Licence status must be declared or unknown"),
        );
      }
      if (typeof value.metadata.license.sourceUrl !== "string") {
        issues.push(
          issue("metadata.license.sourceUrl", "required", "A licence source URL is required"),
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
  if (isObject(value.physical)) {
    validateKeys(value.physical, new Set(["units", "sizeMm", "clearanceMm"]), "physical", issues);
  }
  if (value.physical?.units !== "mm") {
    issues.push(
      issue("physical.units", "unit_invariant", "Physical dimensions must be expressed in mm"),
    );
  }
  if (!isObject(sizeMm)) {
    issues.push(issue("physical.sizeMm", "required", "Physical X/Y/Z dimensions are required"));
  } else {
    validateKeys(sizeMm, new Set(["x", "y", "z"]), "physical.sizeMm", issues);
    for (const axis of ["x", "y", "z"]) {
      if (!isPositiveNumber(sizeMm[axis])) {
        issues.push(
          issue(
            `physical.sizeMm.${axis}`,
            "positive_number",
            `${axis} must be positive and no greater than ${MAX_PHYSICAL_MM} mm`,
          ),
        );
      }
    }
  }
  if (isObject(value.physical?.clearanceMm)) {
    validateKeys(
      value.physical.clearanceMm,
      new Set(["left", "right", "top", "bottom", "above"]),
      "physical.clearanceMm",
      issues,
    );
    for (const side of ["left", "right", "top", "bottom", "above"]) {
      const clearance = value.physical.clearanceMm[side];
      if (!Number.isFinite(clearance) || clearance < 0 || clearance > MAX_PHYSICAL_MM) {
        issues.push(
          issue(`physical.clearanceMm.${side}`, "invalid_clearance", "Clearance must be a finite non-negative millimetre value"),
        );
      }
    }
  }

  const placement = value.placement;
  if (isObject(placement)) {
    validateKeys(
      placement,
      new Set(["resizing", "allowedRotations", "defaultLayer"]),
      "placement",
      issues,
    );
  }
  if (!isObject(placement) || placement.resizing !== "fixed") {
    issues.push(
      issue(
        "placement.resizing",
        "fixed_size_required",
        "v1alpha1 accepts only fixed-size printable variants",
      ),
    );
  }
  if (!isObject(placement) || !new Set(["back", "front"]).has(placement.defaultLayer)) {
    issues.push(
      issue("placement.defaultLayer", "invalid_layer", "Default layer must be back or front"),
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
    if (value.mounting.length > 8) {
      issues.push(issue("mounting", "too_many", "Declare at most 8 mounting-system variants"));
    }
    const mountingSystems = new Set();
    for (const [index, mounting] of value.mounting.entries()) {
      validateKeys(
        mounting,
        new Set(["system", "snapAnchorMm", "attachmentPointsMm"]),
        `mounting.${index}`,
        issues,
      );
      if (!isObject(mounting) || !["openGrid", "underware"].includes(mounting.system)) {
        issues.push(
          issue(`mounting.${index}.system`, "unsupported_system", "Unsupported mounting system"),
        );
      } else if (mountingSystems.has(mounting.system)) {
        issues.push(
          issue(`mounting.${index}.system`, "duplicate_system", "Declare each mounting system once"),
        );
      } else {
        mountingSystems.add(mounting.system);
      }
      validateKeys(
        mounting?.snapAnchorMm,
        new Set(["x", "y"]),
        `mounting.${index}.snapAnchorMm`,
        issues,
      );
      validatePoint(mounting?.snapAnchorMm, `mounting.${index}.snapAnchorMm`, sizeMm, issues);
      if (mounting?.attachmentPointsMm !== undefined) {
        if (!Array.isArray(mounting.attachmentPointsMm) || mounting.attachmentPointsMm.length > 64) {
          issues.push(
            issue(`mounting.${index}.attachmentPointsMm`, "invalid_points", "Attachment points must be an array of at most 64 entries"),
          );
        } else {
          const ids = new Set();
          for (const [pointIndex, point] of mounting.attachmentPointsMm.entries()) {
            const pointPath = `mounting.${index}.attachmentPointsMm.${pointIndex}`;
            validateKeys(point, new Set(["id", "x", "y"]), pointPath, issues);
            if (!isObject(point) || typeof point.id !== "string" || !point.id.trim() || ids.has(point.id)) {
              issues.push(issue(`${pointPath}.id`, "invalid_id", "Attachment-point IDs must be non-empty and unique"));
            } else {
              ids.add(point.id);
            }
            validatePoint(point, pointPath, sizeMm, issues);
          }
        }
      }
    }
  }

  if (value.ports !== undefined) {
    if (!Array.isArray(value.ports) || value.ports.length > 64) {
      issues.push(issue("ports", "invalid_ports", "Ports must be an array of at most 64 entries"));
    } else {
      const ids = new Set();
      for (const [index, port] of value.ports.entries()) {
        const path = `ports.${index}`;
        validateKeys(port, new Set(["id", "kind", "positionMm", "directionDeg"]), path, issues);
        if (!isObject(port) || typeof port.id !== "string" || !port.id.trim() || ids.has(port.id)) {
          issues.push(issue(`${path}.id`, "invalid_id", "Port IDs must be non-empty and unique"));
        } else {
          ids.add(port.id);
        }
        if (port?.kind !== "cable" || !ALLOWED_ROTATIONS.has(port?.directionDeg)) {
          issues.push(issue(path, "invalid_port", "Ports need kind cable and a cardinal direction"));
        }
        validateKeys(port?.positionMm, new Set(["x", "y"]), `${path}.positionMm`, issues);
        validatePoint(port?.positionMm, `${path}.positionMm`, sizeMm, issues);
      }
    }
  }

  if (!isObject(value.capabilities)) {
    issues.push(issue("capabilities", "required", "Capability identifiers are required"));
  } else {
    validateKeys(
      value.capabilities,
      new Set(["renderer", "sizing", "print", "capacity"]),
      "capabilities",
      issues,
    );
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
  if (isObject(visual)) {
    validateKeys(visual, new Set(["type", "coordinateSpace", "viewBoxMm", "svg"]), "visual", issues);
  }
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
    validateKeys(value.print, new Set(["components"]), "print", issues);
    if (value.print.components.length > 20) {
      issues.push(issue("print.components", "too_many", "Declare at most 20 print components"));
    }
    const componentIds = new Set();
    for (const [index, component] of value.print.components.entries()) {
      validateKeys(
        component,
        new Set(["id", "name", "quantity", "fileName", "artifactSha256", "sizeMm"]),
        `print.components.${index}`,
        issues,
      );
      if (
        !isObject(component) ||
        typeof component.id !== "string" ||
        !component.id.trim() ||
        componentIds.has(component.id) ||
        typeof component.name !== "string" ||
        !Number.isInteger(component.quantity) ||
        component.quantity <= 0 ||
        component.quantity > 1000
      ) {
        issues.push(
          issue(
            `print.components.${index}`,
            "invalid_component",
            "Each print component needs a unique ID, name, and quantity from 1 to 1000",
          ),
        );
      } else {
        componentIds.add(component.id);
      }
      if (!isObject(component?.sizeMm)) {
        issues.push(
          issue(
            `print.components.${index}.sizeMm`,
            "required",
            "Each printable component needs exact X/Y/Z millimetre dimensions",
          ),
        );
      } else {
        validateKeys(
          component.sizeMm,
          new Set(["x", "y", "z"]),
          `print.components.${index}.sizeMm`,
          issues,
        );
        for (const axis of ["x", "y", "z"]) {
          if (!isPositiveNumber(component.sizeMm[axis])) {
            issues.push(
              issue(
                `print.components.${index}.sizeMm.${axis}`,
                "positive_number",
                `${axis} must be a positive supported millimetre size`,
              ),
            );
          }
        }
      }
    }
  }

  if (isObject(value.defaults)) {
    validateKeys(value.defaults, new Set(["cables"]), "defaults", issues);
    if (value.defaults.cables !== undefined && (!Number.isInteger(value.defaults.cables) || value.defaults.cables < 0)) {
      issues.push(issue("defaults.cables", "invalid_default", "Default cable count must be a non-negative integer"));
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
  const snapshot = JSON.parse(canonicalizePartManifest(manifest));
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
      snapAnchorsMm: Object.freeze(
        Object.fromEntries(
          manifest.mounting.map((mounting) => [
            mounting.system,
            Object.freeze({ ...mounting.snapAnchorMm }),
          ]),
        ),
      ),
      defaults: Object.freeze({ ...(manifest.defaults ?? {}) }),
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
      manifest: Object.freeze(snapshot),
    }),
  };
}
