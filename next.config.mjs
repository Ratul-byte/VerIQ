/** @type {import('next').NextConfig} */
const nextConfig = {
  // Make sure the bundled sample data ships with the serverless functions.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
  },
  serverExternalPackages: ["unpdf"],
};
export default nextConfig;
