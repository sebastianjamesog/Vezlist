import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import OpenFreeMapLayer from "./OpenFreeMapLayer.jsx";

const { map, createLayer } = vi.hoisted(() => ({
  map: {},
  createLayer: vi.fn(),
}));
vi.mock("react-leaflet", () => ({ useMap: () => map }));
vi.mock("@maplibre/maplibre-gl-leaflet", () => ({ maplibreGL: createLayer }));

let layers;
beforeEach(() => {
  layers = [];
  createLayer.mockReset();
  createLayer.mockImplementation(() => {
    const listeners = new Map();
    const renderer = {
      on: vi.fn((event, callback) => listeners.set(event, callback)),
      off: vi.fn((event) => listeners.delete(event)),
    };
    const layer = {
      addTo: vi.fn(),
      remove: vi.fn(),
      getMaplibreMap: () => renderer,
      renderer,
      listeners,
    };
    layers.push(layer);
    return layer;
  });
});

test("uses the key-free vector style with visible data attribution", () => {
  render(<OpenFreeMapLayer onUnavailable={vi.fn()} />);
  const options = createLayer.mock.calls[0][0];
  expect(options.style).toBe("https://tiles.openfreemap.org/styles/positron");
  expect(options.attributionControl.customAttribution).toContain(
    "OpenMapTiles",
  );
  expect(options.attributionControl.customAttribution).toContain(
    "openstreetmap.org/copyright",
  );
  expect(layers[0].addTo).toHaveBeenCalledWith(map);
});

test("keeps failed imagery visible even when failed requests finish loading", () => {
  const onUnavailable = vi.fn();
  render(<OpenFreeMapLayer onUnavailable={onUnavailable} />);
  const { listeners } = layers[0];
  act(() => listeners.get("error")());
  expect(onUnavailable).toHaveBeenLastCalledWith(true);
  act(() => {
    listeners.get("load")?.();
    listeners.get("idle")?.();
  });
  expect(onUnavailable).toHaveBeenLastCalledWith(true);
});

test("an explicit retry clears the error and releases the failed renderer", () => {
  const onUnavailable = vi.fn();
  const { rerender } = render(
    <OpenFreeMapLayer key={0} onUnavailable={onUnavailable} />,
  );
  act(() => layers[0].listeners.get("error")());
  expect(onUnavailable).toHaveBeenLastCalledWith(true);
  rerender(<OpenFreeMapLayer key={1} onUnavailable={onUnavailable} />);
  expect(onUnavailable).toHaveBeenLastCalledWith(false);
  expect(layers[0].remove).toHaveBeenCalledTimes(1);
  expect(layers).toHaveLength(2);
});

test("releases renderers and listeners across Strict Mode remounts", () => {
  const { unmount } = render(
    <StrictMode>
      <OpenFreeMapLayer onUnavailable={vi.fn()} />
    </StrictMode>,
  );
  expect(layers).toHaveLength(2);
  expect(layers[0].remove).toHaveBeenCalledTimes(1);
  expect(layers[0].listeners.size).toBe(0);
  expect(layers[1].remove).not.toHaveBeenCalled();
  unmount();
  expect(layers[1].remove).toHaveBeenCalledTimes(1);
  expect(layers[1].listeners.size).toBe(0);
});

test("keeps the listing screen usable when WebGL initialization fails", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const layer = {
    addTo: () => {
      throw new Error("WebGL disabled");
    },
    getMaplibreMap: () => undefined,
    getContainer: () => container,
    remove: vi.fn(() => layer.onRemove()),
  };
  createLayer.mockReturnValue(layer);
  const onUnavailable = vi.fn();
  expect(() =>
    render(<OpenFreeMapLayer onUnavailable={onUnavailable} />),
  ).not.toThrow();
  expect(onUnavailable).toHaveBeenCalledWith(true);
  expect(layer.remove).toHaveBeenCalledTimes(1);
  expect(container.isConnected).toBe(false);
});
