/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 这些是原生模块或带 fs 依赖的库；让 Next 在服务端按需 require，不要打进 webpack bundle
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "sqlite-vec",
      "pdf-parse",
      "mammoth",
      "sharp",
    ],
  },
};

export default nextConfig;
