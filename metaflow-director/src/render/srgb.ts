/** Explicit sRGB inputs/encoding; Gaussian radiance remains renderer-owned. */
export const srgbToLinear = (x: number) =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (x: number) =>
  x <= 0.0031308 ? x * 12.92 : 1.055 * Math.max(0, x) ** (1 / 2.4) - 0.055;
export const srgbWGSL = `
fn decodeSRGB(c:vec3f)->vec3f {return select(pow(max((c+vec3f(0.055))/1.055,vec3f(0.0)),vec3f(2.4)),c/12.92,c<=vec3f(0.04045));}
fn encodeSRGB(c:vec3f)->vec3f {return select(1.055*pow(max(c,vec3f(0.0)),vec3f(1.0/2.4))-vec3f(0.055),12.92*c,c<=vec3f(0.0031308));}
`;
export const srgbGLSL = `
vec3 decodeSRGB(vec3 c){return mix(pow(max((c+0.055)/1.055,vec3(0.0)),vec3(2.4)),c/12.92,lessThanEqual(c,vec3(0.04045)));}
vec3 encodeSRGB(vec3 c){return mix(1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,12.92*c,lessThanEqual(c,vec3(0.0031308)));}
`;
