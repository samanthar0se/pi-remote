declare const __PI_TIN_BUILD_REVISION__: string;

export const BUILD_REVISION = typeof __PI_TIN_BUILD_REVISION__ === "string"
  ? __PI_TIN_BUILD_REVISION__
  : process.env.PI_TIN_BUILD_REVISION || "development";
