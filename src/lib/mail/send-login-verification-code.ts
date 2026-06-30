import nodemailer from 'nodemailer';

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const secure = process.env.SMTP_SECURE === 'true';
  const ignoreTLS = process.env.SMTP_IGNORE_TLS === 'true';
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';
  const authMethod = process.env.SMTP_AUTH_METHOD?.trim().toUpperCase();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? '';
  const from = process.env.MAIL_FROM?.trim();

  const port = portRaw ? Number.parseInt(portRaw, 10) : 25;

  if (!host || Number.isNaN(port) || !user || !from || pass.length === 0) {
    return null;
  }

  return { host, port, secure, ignoreTLS, rejectUnauthorized, authMethod, user, pass, from };
}

export async function sendLoginVerificationCode(to: string, code: string) {
  const config = getSmtpConfig();
  if (!config) {
    return { success: false as const, error: '메일 서버 설정이 없습니다.' };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ignoreTLS: config.ignoreTLS,
    tls: {
      rejectUnauthorized: config.rejectUnauthorized,
    },
    auth: {
      user: config.user,
      pass: config.pass,
    },
    authMethod: config.authMethod || undefined,
  });

  try {
    await transporter.sendMail({
      from: config.from,
      to,
      subject: '[Netra] 로그인 인증번호',
      text: `인증번호: ${code}\n\n5분 이내에 입력해 주세요.`,
      html: `<p>인증번호: <strong>${code}</strong></p><p>5분 이내에 입력해 주세요.</p>`,
    });
    return { success: true as const };
  } catch (error) {
    console.error('[Auth] SMTP send failed:', error);
    return {
      success: false as const,
      error: '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
