# Seed-san VRM Model License

## Source

**Model**: Seed-san  
**Version**: VRM 1.0  
**Creator**: VirtualCast, Inc.  
**Repository**: [vrm-c/vrm-specification](https://github.com/vrm-c/vrm-specification)  
**Path**: `samples/Seed-san/vrm/Seed-san.vrm`  
**Downloaded**: 2026-11-13

## License

**VRM Public License 1.0**

Full license text: https://vrm.dev/en/licenses/1.0/index

### Summary

The VRM Public License 1.0 is an open license for VRM character models that permits:
- ✅ Use for testing and development
- ✅ Non-commercial use
- ✅ Modification for testing purposes
- ✅ Redistribution with attribution

### Restrictions

- **Attribution Required**: Credit to VirtualCast, Inc. must be included
- **Non-Commercial**: Commercial use requires separate license
- **Character Rights**: The model represents a specific character; usage should respect character identity

### Attribution

When using Seed-san in this experiment:

> Seed-san model by VirtualCast, Inc.  
> Licensed under VRM Public License 1.0  
> https://vrm.dev/en/licenses/1.0/index

## Usage in This Experiment

**Purpose**: Testing VRM 1.0 loader, animation controller, and spatial integration in desktop portrait experiment.

**Scope**:
- ✅ Local testing and development
- ✅ Browser-based runtime verification
- ✅ Screenshot/video capture for technical documentation
- ✅ No commercial distribution
- ✅ No modification of model geometry/materials
- ✅ Attribution preserved in documentation

**Not Distributed**:
- The `Seed-san.vrm` file is **not committed to the repository**
- Users must download it separately from official VRM specification repository
- `.gitignore` excludes `*.vrm` files to prevent accidental commits

## Features Tested

Seed-san includes:
- **PBR materials**: Physically-based rendering textures
- **MToon materials**: Toon shading (VRM standard)
- **SpringBones**: Physics-based hair/clothing simulation
- **Constraints**: Rotation constraints
- **Expressions**: Morph targets and UV transform
- **LookAt**: Expression-based eye direction

This makes it an excellent comprehensive test case for VRM 1.0 implementation.

## Download Instructions

To obtain Seed-san for testing:

```bash
# Clone VRM specification samples
cd /tmp
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/vrm-c/vrm-specification vrm-spec-samples

cd vrm-spec-samples
git sparse-checkout set samples
git checkout

# Copy Seed-san to experiment directory
cp samples/Seed-san/vrm/Seed-san.vrm \
   /workspace/metaflow-viewer/experiments/desktop-portrait/

# Verify
ls -lh /workspace/metaflow-viewer/experiments/desktop-portrait/Seed-san.vrm
```

## Alternative Models

For users who prefer different models or need permissive licensing:

### VRoid Studio CC0 Models
- **License**: CC0 (Public Domain)
- **Source**: https://vroid.pixiv.help/
- **Models**: β Ver AvatarSample_1/2/3/4, HairSample_Male/Female
- **Download**: Via VRoid Hub

### VRM Consortium Samples
- **License**: VRM Public License 1.0
- **Repository**: https://github.com/vrm-c/vrm-specification/tree/master/samples
- All feature test models available

### Custom VRM
- Create with VRoid Studio (free)
- Export to VRM 1.0 format
- Full control over licensing

## Disclaimer

This experiment does not endorse or claim ownership of any VRM models. All models remain the property of their respective creators and are subject to their original licenses. Users are responsible for complying with model licenses in their own projects.

---

**Document Version**: 1.0  
**Date**: 2026-11-13  
**Experiment**: MetaFlow Desktop Portrait (MF-165)
