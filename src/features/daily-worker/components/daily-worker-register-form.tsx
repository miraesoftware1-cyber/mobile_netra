"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { fetchDailyWorkerCorps, insertDailyWorker } from "@/features/daily-worker/api";
import { cn } from "@/lib/utils";

const schema = z.object({
  attCorpCode: z.string().min(1, "업체명을 선택하세요"),
  etcName: z.string().min(1, "성명을 입력하세요").max(100),
  etcIdno: z
    .string()
    .min(1, "주민번호를 입력하세요")
    .regex(/^\d{6}-?\d{7}$/, "주민번호 형식이 올바르지 않습니다 (예: 900101-1234567)"),
  celNo: z.string().min(9, "연락처를 입력하세요").max(20),
  gender: z.enum(["M", "W"], { errorMap: () => ({ message: "성별을 선택하세요" }) }),
});

type FormValues = z.infer<typeof schema>;

function formatPhone(val: string) {
  const d = val.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function formatIdno(val: string) {
  const d = val.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

type SubmitState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function DailyWorkerRegisterForm() {
  const user = useAuthStore((s) => s.user);
  const companyCode = user?.companyCode?.trim() ?? "";

  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const corpsQuery = useQuery({
    queryKey: ["daily-worker-corps", companyCode],
    queryFn: async () => {
      const result = await fetchDailyWorkerCorps(companyCode);
      if (result.success) return result.data;
      throw new Error((result as { error: string }).error);
    },
    enabled: Boolean(companyCode),
    staleTime: 1000 * 60 * 5,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { attCorpCode: "", etcName: "", etcIdno: "", celNo: "", gender: undefined },
  });

  const genderValue = watch("gender");
  const attCorpCodeValue = watch("attCorpCode");

  async function onSubmit(values: FormValues) {
    setSubmitState({ status: "idle" });
    const result = await insertDailyWorker({
      companyCode,
      attCorpCode: values.attCorpCode.trim(),
      etcName: values.etcName.trim(),
      etcIdno: values.etcIdno.replace(/-/g, ""),
      celNo: values.celNo.replace(/-/g, ""),
      gender: values.gender,
      userId: "DesktopApp",
    });

    if (result.success) {
      setSubmitState({ status: "success", message: result.message });
      reset();
    } else {
      setSubmitState({ status: "error", message: (result as { error: string }).error });
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 px-4 pb-6 pt-4"
    >
      <Card className="border-gray-100 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4">

          {/* 업체명 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">업체명</label>
            {corpsQuery.isPending ? (
              <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 px-3 flex items-center text-sm text-gray-400">
                불러오는 중...
              </div>
            ) : corpsQuery.isError ? (
              <div className="h-11 rounded-lg border border-red-200 bg-red-50 px-3 flex items-center text-xs text-red-500">
                업체 목록을 불러올 수 없습니다.
              </div>
            ) : (
              <Select
                value={attCorpCodeValue}
                onValueChange={(val) => setValue("attCorpCode", val, { shouldValidate: true })}
              >
                <SelectTrigger
                  className={cn(
                    "h-11 font-normal shadow-none",
                    errors.attCorpCode
                      ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                      : "border-gray-200",
                  )}
                  aria-label="업체명 선택"
                >
                  <SelectValue placeholder="업체명을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {(corpsQuery.data ?? []).map((item) => (
                    <SelectItem key={item.c_code} value={item.c_code}>
                      {item.c_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.attCorpCode && (
              <p className="text-xs text-red-500">{errors.attCorpCode.message}</p>
            )}
          </div>

          {/* 성명 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">성명</label>
            <input
              {...register("etcName")}
              type="text"
              maxLength={100}
              placeholder="성명을 입력하세요"
              className={cn(
                "h-11 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-1",
                errors.etcName
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                  : "border-gray-200 focus:border-primary focus:ring-primary/20",
              )}
            />
            {errors.etcName && (
              <p className="text-xs text-red-500">{errors.etcName.message}</p>
            )}
          </div>

          {/* 주민번호 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">주민번호</label>
            <input
              {...register("etcIdno")}
              type="text"
              inputMode="numeric"
              maxLength={14}
              placeholder="000000-0000000"
              onChange={(e) => {
                const formatted = formatIdno(e.target.value);
                setValue("etcIdno", formatted, { shouldValidate: false });
              }}
              className={cn(
                "h-11 w-full rounded-lg border bg-white px-3 font-mono text-sm text-gray-900 outline-none placeholder:font-sans placeholder:text-gray-400 focus:ring-1",
                errors.etcIdno
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                  : "border-gray-200 focus:border-primary focus:ring-primary/20",
              )}
            />
            {errors.etcIdno && (
              <p className="text-xs text-red-500">{errors.etcIdno.message}</p>
            )}
          </div>

          {/* 연락처 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">연락처</label>
            <input
              {...register("celNo")}
              type="text"
              inputMode="numeric"
              maxLength={13}
              placeholder="010-0000-0000"
              onChange={(e) => {
                const formatted = formatPhone(e.target.value);
                setValue("celNo", formatted, { shouldValidate: false });
              }}
              className={cn(
                "h-11 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-1",
                errors.celNo
                  ? "border-red-300 focus:border-red-400 focus:ring-red-200"
                  : "border-gray-200 focus:border-primary focus:ring-primary/20",
              )}
            />
            {errors.celNo && (
              <p className="text-xs text-red-500">{errors.celNo.message}</p>
            )}
          </div>

          {/* 성별 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">성별</label>
            <div className="grid grid-cols-2 gap-2">
              {(["M", "W"] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setValue("gender", val, { shouldValidate: true })}
                  className={cn(
                    "h-11 rounded-lg border text-sm font-medium transition-colors",
                    genderValue === val
                      ? "border-primary bg-primary text-white"
                      : "border-gray-200 bg-white text-gray-700 active:bg-gray-50",
                  )}
                >
                  {val === "M" ? "남자" : "여자"}
                </button>
              ))}
            </div>
            {errors.gender && (
              <p className="text-xs text-red-500">{errors.gender.message}</p>
            )}
          </div>

        </CardContent>
      </Card>

      {submitState.status === "success" && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {submitState.message}
        </div>
      )}

      {submitState.status === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitState.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !companyCode}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-colors active:opacity-80 disabled:opacity-40"
      >
        {isSubmitting ? "등록 중..." : "등록"}
      </button>
    </form>
  );
}
