/**
 * 이메일 전송 유틸리티
 * Resend REST API 직접 호출 (RESEND_API_KEY 환경변수 필요)
 * 미설정 시 false 반환 → 호출자에서 resetUrl을 직접 표시
 */

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  const from =
    process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? '뉴스 대시보드'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[${appName}] 비밀번호 재설정`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; color: #1E1B4B;">
            <div style="margin-bottom: 24px;">
              <div style="display: inline-block; background: #7C3AED; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;">
                <span style="color: white; font-size: 20px;">📰</span>
              </div>
              <h2 style="margin: 0; font-size: 22px; color: #7C3AED;">${appName}</h2>
            </div>
            <h3 style="font-size: 18px; margin-bottom: 12px;">비밀번호 재설정 요청</h3>
            <p style="color: #6B7280; line-height: 1.6; margin-bottom: 24px;">
              비밀번호 재설정 요청이 접수되었습니다.<br>
              아래 버튼을 클릭하여 새 비밀번호를 설정하세요.<br>
              이 링크는 <strong>1시간</strong> 동안만 유효합니다.
            </p>
            <a href="${resetUrl}"
               style="display: inline-block; background: #7C3AED; color: white; padding: 13px 28px;
                      border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              비밀번호 재설정하기
            </a>
            <p style="color: #9CA3AF; font-size: 12px; margin-top: 32px; line-height: 1.5;">
              본인이 요청하지 않으셨다면 이 이메일을 무시하세요.<br>
              링크를 클릭하지 않으면 비밀번호는 변경되지 않습니다.
            </p>
          </div>
        `,
      }),
    })

    return res.ok
  } catch (err) {
    console.error('[MAIL_ERROR]', err)
    return false
  }
}
