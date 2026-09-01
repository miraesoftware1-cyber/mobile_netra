"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Building2, LogIn, Phone, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import {
  fetchLogin,
  type LoginSuccessData,
  requestSmsCode,
  verifySmsCode,
} from "@/features/auth/api";

const loginSchema = z.object({
  companyCode: z
    .string()
    .min(1, "회사 코드를 입력해주세요")
    .max(20, "회사 코드는 20자 이내로 입력해주세요"),
  phoneNumber: z
    .string()
    .min(1, "전화번호를 입력해주세요")
    .regex(/^[0-9]{10,11}$/, "올바른 전화번호를 입력해주세요 (숫자만, 10~11자리)"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type PendingAuthContext = {
  companyCode: string;
  phoneNumber: string;
  userData: LoginSuccessData;
};

type AnyResult = { success: boolean };
const getErr = (r: AnyResult): string =>
  ((r as { success: false; error: string }).error) ?? "오류가 발생했습니다.";

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const hasDeviceRegistered = useAuthStore((s) => s.hasDeviceRegistered);
  const registerDevice = useAuthStore((s) => s.registerDevice);

  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthContext | null>(null);
  const [smsCode, setSmsCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSmsVerified, setIsSmsVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const completeLogin = (context: PendingAuthContext) => {
    const { emailVerificationEnabled: _ev, ...authFields } = context.userData;
    void _ev;
    login({
      companyCode: context.companyCode,
      phoneNumber: context.phoneNumber,
      ...authFields,
    });
    router.push("/menu");
  };

  const onSubmit = async (data: LoginFormValues) => {
    setServerError(null);
    setPendingAuth(null);
    setSmsCode("");
    setIsCodeSent(false);
    setIsSmsVerified(false);

    const result = await fetchLogin({
      companyCode: data.companyCode,
      phoneNumber: data.phoneNumber,
    });

    if (!result.success) {
      setServerError((result as { success: false; error: string }).error);
      return;
    }

    // 이미 기기 등록된 경우 → 바로 로그인
    if (hasDeviceRegistered(data.companyCode, data.phoneNumber)) {
      completeLogin({
        companyCode: data.companyCode,
        phoneNumber: data.phoneNumber,
        userData: result.data,
      });
      return;
    }

    // 최초 로그인 → SMS OTP 단계로
    const pending: PendingAuthContext = {
      companyCode: data.companyCode,
      phoneNumber: data.phoneNumber,
      userData: result.data,
    };
    setPendingAuth(pending);

    // SMS 자동 발송
    setIsSendingCode(true);
    const smsResult = await requestSmsCode({ phoneNumber: data.phoneNumber });
    setIsSendingCode(false);

    if (!smsResult.success) {
      setServerError(getErr(smsResult));
      return;
    }
    setIsCodeSent(true);
  };

  const handleResendSmsCode = async () => {
    if (!pendingAuth) return;
    setServerError(null);
    setIsSendingCode(true);
    const result = await requestSmsCode({ phoneNumber: pendingAuth.phoneNumber });
    setIsSendingCode(false);
    if (!result.success) {
      setServerError(getErr(result));
      return;
    }
    setSmsCode("");
    setIsSmsVerified(false);
    setIsCodeSent(true);
  };

  const handleVerifySmsCode = async () => {
    if (!pendingAuth) return;
    setServerError(null);
    setIsVerifyingCode(true);
    const result = await verifySmsCode({
      phoneNumber: pendingAuth.phoneNumber,
      code: smsCode,
    });
    setIsVerifyingCode(false);

    if (!result.success) {
      setServerError(getErr(result));
      return;
    }

    setIsSmsVerified(true);
    registerDevice(pendingAuth.companyCode, pendingAuth.phoneNumber);
    completeLogin(pendingAuth);
  };

  const handleGoBack = () => {
    setPendingAuth(null);
    setSmsCode("");
    setIsCodeSent(false);
    setIsSmsVerified(false);
    setServerError(null);
  };

  const isCodeValid = /^[0-9]{6}$/.test(smsCode);
  const isOtpStep = Boolean(pendingAuth);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {!isOtpStep && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="companyCode" className="text-sm font-medium text-gray-700">
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
              <p className="text-xs text-red-500">{errors.companyCode.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">
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
              <p className="text-xs text-red-500">{errors.phoneNumber.message}</p>
            )}
          </div>
        </>
      )}

      {serverError && (
        <p className="text-sm text-red-500 text-center -mt-1">{serverError}</p>
      )}

      {!isOtpStep && (
        <Button
          type="submit"
          disabled={isSubmitting || isSendingCode}
          className="h-12 text-base font-semibold mt-2 gap-2"
        >
          <LogIn className="w-4 h-4" />
          {isSubmitting || isSendingCode ? "확인 중..." : "로그인"}
        </Button>
      )}

      {isOtpStep && pendingAuth && (
        <div className="flex flex-col gap-4">
          <div className="text-sm text-gray-700">
            <p>
              <span className="font-semibold">{pendingAuth.phoneNumber}</span>으로
              인증번호를 발송했습니다.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              인증 완료 후 이 기기에서는 다음 로그인부터 바로 접속됩니다.
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={smsCode}
              onChange={(e) =>
                setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && isCodeValid && !isVerifyingCode && !isSmsVerified) {
                  e.preventDefault();
                  handleVerifySmsCode();
                }
              }}
              placeholder="6자리 인증번호"
              inputMode="numeric"
              disabled={isSmsVerified}
              className="h-11 text-center text-lg tracking-widest"
              autoFocus
            />
            <Button
              type="button"
              onClick={handleVerifySmsCode}
              disabled={!isCodeValid || isVerifyingCode || isSmsVerified}
              className="h-11 min-w-[90px]"
            >
              {isVerifyingCode ? "확인 중..." : isSmsVerified ? "완료" : "확인"}
            </Button>
          </div>

          {isSmsVerified && (
            <div className="flex items-center gap-2 text-xs text-green-700">
              <ShieldCheck className="w-4 h-4" />
              <span>인증이 완료되었습니다.</span>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleResendSmsCode}
            disabled={isSendingCode || isSmsVerified}
            className="h-11"
          >
            {isSendingCode ? "발송 중..." : "인증번호 재발송"}
          </Button>

          <Button
            type="button"
            className="h-11 bg-black text-white hover:bg-black/90"
            onClick={handleGoBack}
          >
            뒤로가기
          </Button>
        </div>
      )}
    </form>
  );
}
