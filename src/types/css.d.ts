// CSS module declaration — required for NativeWind global.css import
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
