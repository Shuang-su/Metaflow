"""Independent planar thin-lens reference; no splat loader, sort or renderer.

This evaluates surface rays using a Cartesian pupil quadrature, deliberately
independent of Director's Halton sequence. It establishes pupil footprint and
occlusion trends for controlled planes, not physical truth for scanned SOGs.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


def decode(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)


def encode(c):
    return np.where(c <= .0031308, 12.92 * c,
                    1.055 * np.maximum(c, 0) ** (1 / 2.4) - .055)


def pupil(grid, diameter):
    # Midpoints of equal-area Cartesian cells clipped to a circle.
    xy = (np.arange(grid) + .5) * 2 / grid - 1
    x, y = np.meshgrid(xy, xy)
    inside = x * x + y * y <= 1
    return np.column_stack((x[inside], y[inside])) * diameter * .5


def trace(grid, width=960, height=540):
    origin_z = 7.390753505706454 - .011999998525721534
    origin_y = .03099998430814077
    focus = 9.190753505706454
    diameter = 1.0347054907989037 * math.sqrt(1 / 1.4 ** 2 - 1 / 256)
    focal = width / (2 * math.tan(math.radians(50) * .5))
    # Local strip crop. A far blue plane and two thin front surfaces are known
    # geometry; source Gaussian opacity is not substituted for surface opacity.
    crop = (190, 230, 325, 326)
    xx, yy = np.meshgrid(np.arange(crop[0], crop[2]) + .5,
                         np.arange(crop[1], crop[3]) + .5)
    sx = (xx - width * .5) / focal
    sy = -(yy - height * .5) / focal
    front_depth = origin_z - 2
    image = np.zeros((*xx.shape, 3), dtype=np.float64)
    back = decode([.2, .24, .3])
    red = decode([.9, .2, .12])
    samples = pupil(grid, diameter)
    for ax, ay in samples:
        # Parallel pupil offsets with rays converging at the same focal plane.
        hit_x = sx * front_depth + ax * (1 - front_depth / focus)
        hit_y = origin_y + sy * front_depth + ay * (1 - front_depth / focus)
        opaque = (np.abs(hit_x + 1.3) <= .011) & (np.abs(hit_y) <= 1)
        # The .5 layer is an explicit physical surface parameter, not a claim
        # about the aggregate opacity of many overlapping source Gaussians.
        transparent = (np.abs(hit_x + 1.1) <= .011) & (np.abs(hit_y) <= 1)
        alpha = np.where(opaque, 1., np.where(transparent, .5, 0.))
        image += back[None, None, :] * (1 - alpha[..., None]) + red * alpha[..., None]
    image /= len(samples)
    radius = focal * diameter * .5 * abs(1 / front_depth - 1 / focus)
    # In this crop rays cannot reach the top/bottom ends, so a closed-form
    # circle marginal supplies an exact independent convergence reference.
    radius_world = diameter * .5 * abs(1 - front_depth / focus)
    def cdf(x):
        u = np.clip(x / radius_world, -1, 1)
        return .5 + (u * np.sqrt(np.maximum(0, 1 - u * u)) + np.arcsin(u)) / math.pi
    def coverage(center):
        return cdf(center + .011 - sx * front_depth) - cdf(center - .011 - sx * front_depth)
    alpha = coverage(-1.3) + .5 * coverage(-1.1)
    exact = back[None, None, :] * (1 - alpha[..., None]) + red * alpha[..., None]
    return image, exact, {"grid": grid, "samples": len(samples), "crop": crop,
                   "horizontalFov": 50, "focalPixels": focal,
                   "focus": focus, "diameter": diameter,
                   "frontDepth": front_depth, "defocusRadiusPixels": radius}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    previous = None
    results = []
    for grid in [32, 64, 128]:
        image, exact, metadata = trace(grid)
        metadata["exactMaxLinearDifference"] = float(np.max(abs(image - exact)))
        metadata["exactMeanLinearDifference"] = float(np.mean(abs(image - exact)))
        if previous is not None:
            metadata["priorMaxLinearDifference"] = float(np.max(abs(image - previous)))
            metadata["priorMeanLinearDifference"] = float(np.mean(abs(image - previous)))
        pixels = np.round(np.clip(encode(image), 0, 1) * 255).astype(np.uint8)
        Image.fromarray(pixels).save(args.output / f"thin-lens-{grid}.png")
        results.append(metadata)
        previous = image
    Image.fromarray(np.round(np.clip(encode(exact), 0, 1) * 255).astype(np.uint8)).save(args.output / "thin-lens-exact.png")
    (args.output / "thin-lens-reference.json").write_text(
        json.dumps({"scope": "controlled opaque/.5 planar surfaces; not scanned Gaussian ground truth",
                    "sequence": "independent equal-area Cartesian disk quadrature",
                    "results": results}, indent=2))
    print(json.dumps(results[-1]))


if __name__ == "__main__":
    main()
