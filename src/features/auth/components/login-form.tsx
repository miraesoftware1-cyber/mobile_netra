"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  Building2,
  Fingerprint,
  LogIn,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import {
  fetchLogin,
  type LoginSuccessData,
  requestEmailCode,
  verifyEmailCode,
} from "@/features/auth/api";

const loginSchema = z.object({
  companyCode: z
    .string()
    .min(1, "회사 코드를 입력해주세요")
    .max(20, "회사 코드는 20자 이내로 입력해주세요"),
  phoneNumber: z
    .string()
    .min(1, "전화번호를 입력해주세요")
    .regex(
      /^[0-9]{10,11}$/,
      "올바른 전화번호를 입력해주세요 (숫자만, 10~11자리)",
    ),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type PendingAuthContext = {
  companyCode: string;
  phoneNumber: string;
  userData: LoginSuccessData;
};

const generateRandomBytes = (size: number) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
};

const toUserIdBytes = (value: string) => {
  const encoded = new TextEncoder().encode(value);
  return encoded.slice(0, 64);
};

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const hasBiometricRegistered = useAuthStore((s) => s.hasBiometricRegistered);
  const registerBiometric = useAuthStore((s) => s.registerBiometric);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthContext | null>(
    null,
  );
  const [emailCode, setEmailCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    setPendingAuth(null);
    setEmailCode("");
    setIsCodeSent(false);
    setIsEmailVerified(false);

    const result = await fetchLogin({
      companyCode: data.companyCode,
      phoneNumber: data.phoneNumber,
    });

    if (!result.success) {
      const failResult = result as { success: false; error: string };
      setServerError(failResult.error);
      return;
    }

    const skipEmailAndBiometricOnboarding =
      !result.data.emailVerificationEnabled ||
      hasBiometricRegistered(data.companyCode, data.phoneNumber);

    if (skipEmailAndBiometricOnboarding) {
      const { emailVerificationEnabled: _ev, ...authFields } = result.data;
      void _ev;
      login({
        companyCode: data.companyCode,
        phoneNumber: data.phoneNumber,
        ...authFields,
      });
      router.push("/menu");
      return;
    }

    setPendingAuth({
      companyCode: data.companyCode,
      phoneNumber: data.phoneNumber,
      userData: result.data,
    });
  };

  const handleSendEmailCode = async () => {
    if (!pendingAuth) {
      return;
    }

    setServerError(null);
    setIsSendingCode(true);

    const response = await requestEmailCode({
      email: pendingAuth.userData.email,
    });
    setIsSendingCode(false);

    if (response.success === false) {
      setServerError(response.error);
      return;
    }

    setIsCodeSent(true);
  };

  const handleVerifyEmailCode = async () => {
    if (!pendingAuth) {
      return;
    }

    setServerError(null);
    setIsVerifyingCode(true);

    const response = await verifyEmailCode({
      email: pendingAuth.userData.email,
      code: emailCode,
    });
    setIsVerifyingCode(false);

    if (response.success === false) {
      setServerError(response.error);
      return;
    }

    setIsEmailVerified(true);
  };

  const registerWebAuthnCredential = async (context: PendingAuthContext) => {
    if (!window.PublicKeyCredential) {
      throw new Error("현재 기기에서는 생체 인증 등록을 지원하지 않습니다.");
    }

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: generateRandomBytes(32),
        rp: { name: "Netra" },
        user: {
          id: toUserIdBytes(`${context.companyCode}:${context.phoneNumber}`),
          name:
            context.userData.email.trim() !== ""
              ? context.userData.email
              : `${context.companyCode}:${context.phoneNumber}`,
          displayName: context.userData.emp_name,
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
        attestation: "none",
      },
    });

    if (!credential) {
      throw new Error("생체 인증 등록을 완료하지 못했습니다.");
    }
  };

  const handleRegisterBiometricAndLogin = async () => {
    const needsEmailStep = pendingAuth?.userData.emailVerificationEnabled ?? true;
    if (!pendingAuth || (needsEmailStep && !isEmailVerified)) {
      return;
    }

    setServerError(null);
    setIsRegisteringBiometric(true);

    try {
      await registerWebAuthnCredential(pendingAuth);
      registerBiometric(pendingAuth.companyCode, pendingAuth.phoneNumber);

      const { emailVerificationEnabled: _ev, ...authFields } =
        pendingAuth.userData;
      void _ev;
      login({
        companyCode: pendingAuth.companyCode,
        phoneNumber: pendingAuth.phoneNumber,
        ...authFields,
      });

      router.push("/menu");
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "생체 인증 등록 중 오류가 발생했습니다.",
      );
    } finally {
      setIsRegisteringBiometric(false);
    }
  };

  const isFirstLoginFlow = Boolean(pendingAuth);
  const submitButtonLabel = isFirstLoginFlow ? "다음" : "로그인";

  const isAuthCodeValid = /^[0-9]{6}$/.test(emailCode);
  const handleGoBackToCredentialStep = () => {
    setPendingAuth(null);
    setEmailCode("");
    setIsCodeSent(false);
    setIsEmailVerified(false);
    setServerError(null);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {!isFirstLoginFlow && (
        <>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="companyCode"
              className="text-sm font-medium text-gray-700"
            >
              회사 코드
            </Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="companyCode"
                placeholder="회사 코드를 입력하세요"
                className="pl-10 h-12 text-base"
                {...register("companyCode")}
              />
            </div>
            {errors.companyCode && (
              <p className="text-xs text-red-500">
                {errors.companyCode.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="phoneNumber"
              className="text-sm font-medium text-gray-700"
            >
              전화번호
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="전화번호를 입력하세요 (숫자만)"
                className="pl-10 h-12 text-base"
                inputMode="numeric"
                {...register("phoneNumber")}
              />
            </div>
            {errors.phoneNumber && (
              <p className="text-xs text-red-500">
                {errors.phoneNumber.message}
              </p>
            )}
          </div>
        </>
      )}

      {serverError && (
        <p className="text-sm text-red-500 text-center -mt-1">{serverError}</p>
      )}

      {!isFirstLoginFlow && (
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-12 text-base font-semibold mt-2 gap-2"
        >
          <LogIn className="w-4 h-4" />
          {isSubmitting ? "확인 중..." : submitButtonLabel}
        </Button>
      )}

      {isFirstLoginFlow && pendingAuth && (
        <div className="flex flex-col gap-4">
          <div className="text-sm text-gray-700">
            <p>
              {pendingAuth.userData.emailVerificationEnabled ? (
                <>
                  최초 로그인입니다. 이메일 인증 후 지문/Face 등록을 완료하면 다음
                  로그인부터는 회사코드와 전화번호만으로 로그인됩니다.
                </>
              ) : (
                <>
                  최초 로그인입니다. 지문/Face 등록을 완료하면 다음 로그인부터는
                  회사코드와 전화번호만으로 로그인됩니다.
                </>
              )}
            </p>
          </div>

          {pendingAuth.userData.emailVerificationEnabled && (
            <>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-gray-700"
                >
                  이메일
                </Label>
                <Input
                  id="email"
                  value={pendingAuth.userData.email}
                  disabled
                  className="h-11"
                />
              </div>

              <Button
                type="button"
                onClick={handleSendEmailCode}
                disabled={isSendingCode}
                className="h-11 bg-black text-white hover:bg-black/90"
              >
                {isSendingCode
                  ? "인증번호 발송 중..."
                  : isCodeSent
                    ? "인증번호 재발송"
                    : "인증번호 발송"}
              </Button>

              <div className="flex gap-2">
                <Input
                  value={emailCode}
                  onChange={(event) =>
                    setEmailCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  placeholder="6자리 인증번호 입력"
                  inputMode="numeric"
                  disabled={!isCodeSent || isEmailVerified}
                  className="h-11"
                />
                <Button
                  type="button"
                  onClick={handleVerifyEmailCode}
                  disabled={
                    !isCodeSent ||
                    !isAuthCodeValid ||
                    isVerifyingCode ||
                    isEmailVerified
                  }
                  className="h-11 min-w-[120px]"
                >
                  {isVerifyingCode
                    ? "확인 중..."
                    : isEmailVerified
                      ? "확인 완료"
                      : "인증 확인"}
                </Button>
              </div>
            </>
          )}

          <Button
            type="button"
            onClick={handleRegisterBiometricAndLogin}
            disabled={
              (pendingAuth.userData.emailVerificationEnabled &&
                !isEmailVerified) ||
              isRegisteringBiometric
            }
            className="h-11 gap-2"
          >
            <Fingerprint className="w-4 h-4" />
            {isRegisteringBiometric ? "등록 중..." : "지문/Face 등록 후 로그인"}
          </Button>

          {pendingAuth.userData.emailVerificationEnabled && isEmailVerified && (
            <div className="flex items-center gap-2 text-xs text-green-700">
              <ShieldCheck className="w-4 h-4" />
              <span>이메일 인증이 완료되었습니다.</span>
            </div>
          )}

          <Button
            type="button"
            className="h-11 bg-black text-white hover:bg-black/90"
            onClick={handleGoBackToCredentialStep}
          >
            뒤로가기
          </Button>
        </div>
      )}
    </form>
  );
}
