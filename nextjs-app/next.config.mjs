/** @type {import('next').NextConfig} */
const nextConfig = {
  // 외부 이미지 도메인 전체 허용 (뉴스 썸네일)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Prisma + bcryptjs를 서버 번들에서 제외 (Vercel 서버리스 호환)
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
}

export default nextConfig
