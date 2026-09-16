import sharp from "sharp";

export const validateImageDimensions = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (metadata.width > 5000 || metadata.height > 5000) {
      throw new Error("Image dimensions too large (max 5000x5000)");
    }
    
    if (metadata.width < 100 || metadata.height < 100) {
      throw new Error("Image too small (min 100x100)");
    }
    
    return true;
  } catch (err) {
    throw new Error("Invalid image file");
  }
};