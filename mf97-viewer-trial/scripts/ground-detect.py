#!/usr/bin/env python3
"""Persistent, CPU-only Open3D 0.19 planar detection. JSON line input/output.

No mesh reconstruction, hole filling, global floor projection, or implicit acceptance.
"""
import json
import os
import sys
import traceback
os.environ.setdefault("OPEN3D_DISABLE_WEB_VISUALIZER", "true")
os.environ.setdefault("OMP_NUM_THREADS", "2")
import numpy as np
import open3d as o3d

if o3d.__version__ != "0.19.0":
    raise RuntimeError("MF97 requires Open3D 0.19.0")
o3d.utility.set_verbosity_level(o3d.utility.VerbosityLevel.Error)

def detect(message):
    xyz = np.asarray(message["points"], dtype=np.float64).reshape((-1, 3))
    if len(xyz) > 100000:
        raise ValueError("Chunk point budget exceeds 100000")
    if len(xyz) < 30:
        return {"detector": "Open3D-0.19.0.detect_planar_patches", "patches": []}
    if not np.isfinite(xyz).all():
        raise ValueError("Nonfinite source coordinates")
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(xyz))
    cloud.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=0.45, max_nn=30))
    cloud.orient_normals_to_align_with_direction([0, 1, 0])
    boxes = cloud.detect_planar_patches(
        normal_variance_threshold_deg=30,
        coplanarity_deg=75,
        outlier_ratio=0.65,
        min_plane_edge_length=0.4,
        min_num_points=20,
        search_param=o3d.geometry.KDTreeSearchParamKNN(knn=30),
    )
    patches = []
    for box in boxes:
        center, rotation, extent = np.asarray(box.center), np.asarray(box.R), np.asarray(box.extent)
        normal = rotation[:, 2].copy()
        if abs(normal[1]) < np.cos(np.pi / 9):
            continue
        if normal[1] < 0:
            normal *= -1
        # Detect the plane robustly, then include small outliers for a proposed diff.
        local = (xyz - center) @ rotation
        inside = (np.abs(local[:, 0]) <= extent[0]/2 + 1e-7) & (np.abs(local[:, 1]) <= extent[1]/2 + 1e-7)
        inside &= np.abs((xyz-center) @ normal) <= float(message.get("voxelResolution", .08))*1.55
        indices = np.flatnonzero(inside)
        patches.append({"center": center.tolist(), "rotation": rotation.tolist(), "extent": extent.tolist(),
                        "plane": [*normal.tolist(), -float(normal @ center)], "pointIndices": indices.tolist()})
    patches.sort(key=lambda p: tuple(round(v, 4) for v in p["center"]))
    return {"detector": "Open3D-0.19.0.detect_planar_patches", "patches": patches}

for line in sys.stdin:
    try:
        print(json.dumps(detect(json.loads(line)), separators=(",", ":")), flush=True)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(error)}), flush=True)
