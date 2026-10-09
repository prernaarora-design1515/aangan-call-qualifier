/** @type {import('next').NextConfig} */
const nextConfig = {
  // The classifier reads the studio docs from disk at runtime; ship them with the functions.
  outputFileTracingIncludes: { "/**": ["./knowledge/**/*"] },
  serverExternalPackages: ["pg"],
};
export default nextConfig;
