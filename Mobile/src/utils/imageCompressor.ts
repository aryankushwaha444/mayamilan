// src/utils/imageCompressor.ts — SAFE PASSTHROUGH. expo-image-manipulator is NOT in
// package.json, so we never import it (that would reproduce the EXAV crash). The image
// picker already downscales via quality:0.8. To enable true compression:
//   npx expo install expo-image-manipulator   (then rebuild) and uncomment the body.
export interface CompressibleAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}
export async function compressChatImage(
  asset: CompressibleAsset
): Promise<CompressibleAsset> {
  // try {
  //   const Manipulator = require("expo-image-manipulator");
  //   const r = await Manipulator.manipulateAsync(asset.uri, [{ resize: { width: 1280 } }],
  //     { compress: Manipulator.CompressFormat.JPEG, quality: 0.8 });
  //   return { ...asset, uri: r.uri, mimeType: "image/jpeg" };
  // } catch { /* fall through */ }
  return asset; // passthrough: picker's quality:0.8 already applied
}
