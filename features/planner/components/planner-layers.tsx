import { usePlanner } from "../application/planner-provider";
import type { CableRoute, PlannerItem, ResizeCorner } from "../model/types";
import { ItemVisual } from "./item-renderers";

export function RouteLayer({ route }: { route: CableRoute }) {
  const {
    selectedRouteId,
    routeGeometryById,
    handleRoutePointerDown,
  } = usePlanner();
  const routePoints = route.points.map((point) => point.join(",")).join(" ");
  const routeGeometry = routeGeometryById.get(route.id);
  const routePath = routeGeometry?.path ?? "";

  return (
    <g
      className={`route ${selectedRouteId === route.id ? "selected" : ""}`}
    >
      <path
        d={routePath}
        className="route-hit"
        onPointerDown={(event) => handleRoutePointerDown(event, route)}
      />
      <path
        d={routePath}
        className="route-halo"
        strokeWidth={route.diameter + 10}
      />
      <path
        d={routePath}
        stroke={route.color}
        strokeWidth={route.diameter + 3}
      />
      {selectedRouteId === route.id && (
        <>
          <path d={routePath} className="route-selection" />
          <polyline points={routePoints} className="route-centerline" />
        </>
      )}
    </g>
  );
}

export function ItemLayer({ item }: { item: PlannerItem }) {
  const {
    selectedId,
    handlePointerDown,
    handleResizePointerDown,
    selectItem,
  } = usePlanner();
  return (
    <g
      className={`planner-item item-${item.kind} ${
        selectedId === item.id ? "selected" : ""
      }`}
      onPointerDown={(event) => handlePointerDown(event, item)}
      filter={item.kind === "grid" ? undefined : "url(#item-shadow)"}
      role="button"
      aria-label={`${item.name}, at ${item.x} by ${item.y} millimetres`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") selectItem(item.id);
      }}
    >
      <ItemVisual item={item} />
      {selectedId === item.id && (
        <>
          <rect
            x={item.x - 6}
            y={item.y - 6}
            width={item.width + 12}
            height={item.height + 12}
            rx="16"
            className="selection-outline"
          />
          {[
            ["nw", item.x - 6, item.y - 6],
            ["ne", item.x + item.width + 6, item.y - 6],
            ["sw", item.x - 6, item.y + item.height + 6],
            ["se", item.x + item.width + 6, item.y + item.height + 6],
          ].map(([corner, x, y]) => (
            <rect
              key={corner}
              x={Number(x) - 7}
              y={Number(y) - 7}
              width="14"
              height="14"
              className={`selection-handle resize-${corner}`}
              onPointerDown={(event) =>
                handleResizePointerDown(
                  event,
                  item,
                  corner as ResizeCorner,
                )
              }
              aria-label={`Resize ${item.name} from ${corner} corner`}
            />
          ))}
        </>
      )}
    </g>
  );
}
