"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, eachDayOfInterval, parseISO, getYear, getDay } from "date-fns";
import { ko } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { CalendarDays, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useHolidayTypes } from "@/features/leave/hooks/use-holiday-types";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import {
  fetchHolidayInfo,
  fetchCompanyHolidays,
  submitLeaveRequest,
  type HolidayInfo,
  type HolidayTypeItem,
  type CompanyHolidayItem,
} from "@/features/leave/api";

const leaveRequestSchema = z.object({
  leaveTypeCode: z.string().min(1, "구분을 선택해주세요"),
  startDate: z.string().min(1, "시작일을 선택해주세요"),
  endDate: z.string().min(1, "종료일을 선택해주세요"),
  reason: z.string().optional(),
  note: z.string().optional(),
});

type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

const TODAY = format(new Date(), "yyyy-MM-dd");
const CURRENT_YEAR = String(getYear(new Date()));

/**
 * 시작일~종료일 사이에서 주말(토·일) 및 공휴일을 제외한 근무일수에
 * subtract_val 을 곱해 실제 차감 일수를 반환
 * subtract_flag === 'N' 인 경우(공가·기타 등) subtractVal = 0 으로 전달
 */
function calcUsedDays(
  startDate: string,
  endDate: string,
  holidayDates: Set<string>,
  subtractVal: number,
): number {
  if (!startDate || !endDate || startDate > endDate || subtractVal === 0)
    return 0;
  const days = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  });
  const workingDays = days.filter((day) => {
    const dayOfWeek = getDay(day);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = holidayDates.has(format(day, "yyyy-MM-dd"));
    return !isWeekend && !isHoliday;
  }).length;
  return workingDays * subtractVal;
}

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  error?: string;
}

function FieldRow({ label, children, error }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-semibold text-gray-700">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function getInitDefaultLeaveTypeCode(
  types: HolidayTypeItem[] | undefined,
): string {
  return types?.find((t) => t.init_flag === "Y")?.holi_type_code ?? "";
}

interface DatePickerFieldProps {
  value: string;
  onChange: (dateStr: string) => void;
  placeholder?: string;
  disabledBefore?: string;
  holidayDates?: Set<string>;
}

function DatePickerField({
  value,
  onChange,
  placeholder = "날짜 선택",
  disabledBefore,
  holidayDates,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = value ? parseISO(value) : undefined;
  // minDate는 연도의 1월 1일을 기준으로 한다.
  const year = (disabledBefore ? parseISO(disabledBefore) : parseISO(TODAY)).getFullYear();
  const minDate = parseISO(`${year}-01-01`);

  const handleSelect = (date: Date | undefined) => {
    onChange(date ? format(date, "yyyy-MM-dd") : "");
    setOpen(false);
  };

  /** holidayDates가 바뀔 때만 DayButton 컴포넌트 재생성 */
  const ColoredDayButton = useMemo(() => {
    const dates = holidayDates;
    return function DayButtonColored(
      props: React.ComponentProps<typeof CalendarDayButton>,
    ) {
      const { day, modifiers, className } = props;
      const dayOfWeek = day.date.getDay();
      const isSaturday = dayOfWeek === 6;
      const isSunday = dayOfWeek === 0;
      const dateStr = format(day.date, "yyyy-MM-dd");
      const isHoliday = dates?.has(dateStr) ?? false;
      const isRed = isSunday || isHoliday;

      return (
        <CalendarDayButton
          {...props}
          className={cn(
            className,
            !modifiers.selected &&
              !modifiers.disabled &&
              isSaturday &&
              !isRed &&
              "text-blue-500 hover:text-blue-600",
            !modifiers.selected &&
              !modifiers.disabled &&
              isRed &&
              "text-red-500 hover:text-red-600",
          )}
        />
      );
    };
  }, [holidayDates]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-11 w-full justify-start border-gray-200 font-normal",
            !value && "text-gray-400",
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 text-gray-400" />
          {value ? format(parseISO(value), "yyyy-MM-dd") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={(date) => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            return d < minDate;
          }}
          locale={ko}
          formatters={{
            formatCaption: (date) => format(date, "yyyy년 M월", { locale: ko }),
            formatWeekdayName: (date) => format(date, "eeeee", { locale: ko }),
          }}
          components={{ DayButton: ColoredDayButton }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function LeaveRequestForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: holidayInfo, isLoading: isHolidayLoading } =
    useQuery<HolidayInfo | null>({
      queryKey: [
        "holidayInfo",
        user?.companyCode,
        user?.emp_code,
        CURRENT_YEAR,
      ],
      queryFn: async () => {
        if (!user?.companyCode || !user?.emp_code) return null;
        const result = await fetchHolidayInfo(
          user.companyCode,
          user.emp_code,
          CURRENT_YEAR,
        );
        if (result.success) return result.data;
        const failResult = result as { success: false; error: string };
        throw new Error(failResult.error);
      },
      enabled: !!user?.companyCode && !!user?.emp_code,
    });

  const { items: holidayTypes, isLoading: isHolidayTypesLoading } =
    useHolidayTypes(user?.companyCode);

  const { data: companyHolidays = [] } = useQuery<CompanyHolidayItem[]>({
    queryKey: [
      "companyHolidays",
      user?.companyCode,
      user?.corp_code,
      CURRENT_YEAR,
    ],
    queryFn: async () => {
      if (!user?.companyCode || !user?.corp_code) return [];
      const result = await fetchCompanyHolidays(
        user.companyCode,
        user.corp_code,
        CURRENT_YEAR,
      );
      if (result.success) return result.data;
      return [];
    },
    enabled: !!user?.companyCode && !!user?.corp_code,
  });

  /** hdate "20260101" → "2026-01-01" 형식으로 변환한 Set */
  const holidayDates = useMemo(() => {
    return new Set(
      companyHolidays.map(
        ({ hdate }) =>
          `${hdate.slice(0, 4)}-${hdate.slice(4, 6)}-${hdate.slice(6, 8)}`,
      ),
    );
  }, [companyHolidays]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      leaveTypeCode: "",
      startDate: "",
      endDate: "",
      reason: "",
      note: "",
    },
  });

  useEffect(() => {
    if (!holidayTypes.length) return;
    const defaultType = holidayTypes.find((t) => t.init_flag === "Y");
    if (defaultType) {
      setValue("leaveTypeCode", defaultType.holi_type_code, {
        shouldDirty: false,
      });
    }
  }, [holidayTypes, setValue]);

  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const leaveTypeCode = watch("leaveTypeCode");

  const subtractVal = useMemo(() => {
    const selectedType = holidayTypes.find(
      (t) => t.holi_type_code === leaveTypeCode,
    );
    if (!selectedType || selectedType.subtract_flag === "N") return 0;
    return parseFloat(selectedType.subtract_val ?? "1");
  }, [holidayTypes, leaveTypeCode]);

  const usedDays = calcUsedDays(startDate, endDate, holidayDates, subtractVal);

  const [exceedWarningOpen, setExceedWarningOpen] = useState(false);
  const [dateOrderWarningOpen, setDateOrderWarningOpen] = useState(false);
  const [resultDialog, setResultDialog] = useState<{
    open: boolean;
    success: boolean;
    message: string;
  }>({ open: false, success: false, message: "" });

  const toDateParam = (dateStr: string) => dateStr.replace(/-/g, "");

  const onSubmit = async (data: LeaveRequestFormValues) => {
    if (data.startDate > data.endDate) {
      setDateOrderWarningOpen(true);
      return;
    }

    const remainingDays = holidayInfo?.year_reday ?? 0;
    if (subtractVal > 0 && usedDays > remainingDays) {
      setExceedWarningOpen(true);
      return;
    }

    if (!user) return;

    const result = await submitLeaveRequest({
      companyCode: user.companyCode,
      emp_code: user.emp_code,
      emp_name: user.emp_name,
      corp_code: user.corp_code,
      dpt_code: user.dpt_code,
      year: CURRENT_YEAR,
      leaveTypeCode: data.leaveTypeCode,
      appliedDate: toDateParam(TODAY),
      startDate: toDateParam(data.startDate),
      endDate: toDateParam(data.endDate),
      usedDays,
      note: data.note ?? "",
      reason: data.reason ?? "",
      phoneNumber: user.phoneNumber,
    });

    if (result.success) {
      setResultDialog({ open: true, success: true, message: result.message });
    } else {
      const errorResult = result as { success: false; error: string };
      setResultDialog({
        open: true,
        success: false,
        message: errorResult.error,
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      method="post"
      className="flex-1 flex flex-col min-h-0"
    >
      {/* ── 고정 상단: 성명 / 신청일 / 총연차 / 잔여일수 ── */}
      <div className="flex-shrink-0 flex flex-col gap-4 px-4 pt-5 pb-4 border-b border-gray-100">
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <Label className="text-sm font-semibold text-gray-700">성명</Label>
            <Input
              value={user?.emp_name ?? ""}
              disabled
              className="h-11 bg-gray-50 text-gray-900 border-gray-200"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              신청일
            </Label>
            <Input
              value={TODAY}
              disabled
              className="h-11 bg-gray-50 text-gray-900 border-gray-200"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              발생연차
            </Label>
            <Input
              value={
                isHolidayLoading ? "..." : `${holidayInfo?.year_alday ?? "-"}일`
              }
              disabled
              className="h-11 bg-blue-50 text-blue-600 border-blue-100 text-center font-semibold"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <Label className="text-sm font-semibold text-gray-700">
              미사용연차
            </Label>
            <Input
              value={
                isHolidayLoading ? "..." : `${holidayInfo?.year_reday ?? "-"}일`
              }
              disabled
              className="h-11 bg-blue-50 text-blue-600 border-blue-100 text-center font-semibold"
            />
          </div>
        </div>
      </div>

      {/* ── 스크롤 가능 영역: 구분 ~ 비고 (하단 fixed 버튼 높이만큼 여백) ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {/* 구분 */}
        <FieldRow label="구분" error={errors.leaveTypeCode?.message}>
          <Controller
            name="leaveTypeCode"
            control={control}
            render={({ field }) => (
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isHolidayTypesLoading}
              >
                <SelectTrigger className="h-11 border-gray-200">
                  <SelectValue
                    placeholder={
                      isHolidayTypesLoading
                        ? "불러오는 중..."
                        : "연차 종류를 선택하세요"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {holidayTypes.map((type) => (
                    <SelectItem
                      key={type.holi_type_code}
                      value={type.holi_type_code}
                    >
                      {type.holi_type_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FieldRow>

        {/* 사용일(기간) */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            사용일
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-gray-400">시작일</span>
              <Controller
                name="startDate"
                control={control}
                render={({ field }) => (
                  <DatePickerField
                    value={field.value}
                    onChange={(dateStr) => {
                      field.onChange(dateStr);
                      if (!endDate && dateStr) {
                        setValue("endDate", dateStr, { shouldValidate: true });
                      }
                    }}
                    placeholder="시작일 선택"
                    disabledBefore={undefined}
                    holidayDates={holidayDates}
                  />
                )}
              />
              {errors.startDate && (
                <p className="text-xs text-red-500">
                  {errors.startDate.message}
                </p>
              )}
            </div>
            <span className="text-gray-400 pt-5">~</span>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs text-gray-400">종료일</span>
              <Controller
                name="endDate"
                control={control}
                render={({ field }) => (
                  <DatePickerField
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="종료일 선택"
                    // disabledBefore={startDate || TODAY}
                    disabledBefore={startDate}
                    holidayDates={holidayDates}
                  />
                )}
              />
              {errors.endDate && (
                <p className="text-xs text-red-500">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          {/* 사용일수 */}
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className="text-xs text-gray-400">사용연차</span>
            <span
              className={cn(
                "text-sm font-bold tabular-nums",
                usedDays > 0 ? "text-primary" : "text-gray-300",
              )}
            >
              {Number.isInteger(usedDays) ? usedDays : usedDays.toFixed(1)}일
            </span>
          </div>
        </div>

        {/* 사유 */}
        <FieldRow label="사유" error={errors.reason?.message}>
          <Textarea
            placeholder="사유를 입력하세요"
            className="h-[100px] resize-none border-gray-200 text-gray-800 placeholder:text-gray-400"
            {...register("reason")}
          />
        </FieldRow>

        {/* 비고 */}
        <FieldRow label="비고">
          <Textarea
            placeholder="비고 사항을 입력하세요"
            className="h-[100px] resize-none border-gray-200 text-gray-800 placeholder:text-gray-400"
            {...register("note")}
          />
        </FieldRow>
      </div>

      {/* ── 뷰포트 하단 고정: 버튼 (flex 레이아웃과 무관하게 항상 보이도록) ── */}
      <div
        className={cn(
          "fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 gap-3",
          "border-t border-gray-100 bg-white px-4 pt-4",
          "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 border-gray-200 text-gray-600"
          onClick={() => router.back()}
        >
          취소
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-12 flex-1 gap-2 font-semibold"
        >
          <Send className="h-4 w-4" />
          신청하기
        </Button>
      </div>

      {/* 잔여일수 초과 경고 다이얼로그 */}
      <AlertDialog
        open={dateOrderWarningOpen}
        onOpenChange={setDateOrderWarningOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-center">
              날짜 확인
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              시작일은 종료일보다 늦을 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDateOrderWarningOpen(false)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 잔여일수 초과 경고 다이얼로그 */}
      <AlertDialog open={exceedWarningOpen} onOpenChange={setExceedWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-center">
              잔여일수 초과
            </AlertDialogTitle>
            <AlertDialogDescription>
              신청하려는 사용일수
              <span className="font-semibold text-primary mx-1">
                ({Number.isInteger(usedDays) ? usedDays : usedDays.toFixed(1)}
                일)
              </span>
              가 잔여일수
              <span className="font-semibold text-red-500 mx-1">
                ({holidayInfo?.year_reday ?? 0}일)
              </span>
              를 초과합니다.
              <br />
              날짜를 다시 확인해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setExceedWarningOpen(false)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 신청 결과 다이얼로그 */}
      <AlertDialog
        open={resultDialog.open}
        onOpenChange={(open) => setResultDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle className="text-center">
              {resultDialog.success ? "신청 완료" : "신청 실패"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {resultDialog.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setResultDialog((prev) => ({ ...prev, open: false }));
                if (resultDialog.success) router.back();
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
