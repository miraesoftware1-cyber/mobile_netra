"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarDays,
  Camera,
  FileText,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import {
  fetchExpenseApprovers,
  fetchExpensePayTypes,
  fetchExpenseResolutionItems,
  insertExpenseResolution,
  uploadExpenseReceipts,
  type ExpenseApproverItem,
  type ExpensePayTypeItem,
} from "@/features/expense/api";
import { ExpenseProjectPicker } from "@/features/expense/components/expense-project-picker";
import { ReceiptImagePinchPreview } from "@/features/expense/components/receipt-image-pinch-preview";
import { EXPENSE_REFERENCE_DATA_STALE_TIME_MS } from "@/features/expense/constants/react-query";
import { useExpenseProjectsQuery } from "@/features/expense/hooks/use-expense-projects-query";

function getDefaultPayTypeCode(types: ExpensePayTypeItem[]): string {
  return types.find((row) => row.c_attr3 === "Y")?.c_code ?? "";
}

function getInitDefaultPayTypeCode(
  types: ExpensePayTypeItem[] | undefined,
): string {
  if (!types?.length) return "";
  return getDefaultPayTypeCode(types);
}

function parseMoneyInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toDateText(value: string | undefined): string {
  if (!value) return format(new Date(), "yyyyMMdd");
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return digits;
  return format(new Date(), "yyyyMMdd");
}

function formatDigitsWithCommaGrouping(digits: string): string {
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) return "";
  return Math.trunc(n).toLocaleString("ko-KR");
}

const EXPENSE_SUMMARY_VARCHAR100_UTF8_MAX_BYTES = 100;
const EXPENSE_RECEIPT_ATTACHMENT_MAX = 10;
const FIELD_SCROLL_MARGIN_TOP = "calc(env(safe-area-inset-top, 0px) + 76px)";

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function truncateToUtf8ByteLength(value: string, maxBytes: number): string {
  if (getUtf8ByteLength(value) <= maxBytes) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (getUtf8ByteLength(value.slice(0, mid)) <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  return value.slice(0, lo);
}

function MoneyDigitsInput({
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  name,
  ref,
  className,
  placeholder = "0",
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  name: string;
  ref: React.Ref<HTMLInputElement>;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      name={name}
      ref={ref}
      placeholder={placeholder}
      className={cn("text-right", className)}
      value={value}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        if (!digits) {
          onChange("");
          return;
        }
        onChange(formatDigitsWithCommaGrouping(digits));
      }}
    />
  );
}

function buildReceiptPathAndFileNamesParam(uploadedRemotePaths: string[]): {
  receiptPath: string;
  receiptFileNames: string;
} {
  if (!uploadedRemotePaths.length) {
    return { receiptPath: "", receiptFileNames: "" };
  }

  const splitRemote = (full: string) => {
    const index = Math.max(full.lastIndexOf("/"), full.lastIndexOf("\\"));
    if (index < 0) return { dir: "", base: full };
    return { dir: full.slice(0, index), base: full.slice(index + 1) };
  };

  const segments = uploadedRemotePaths.map((full) => splitRemote(full));
  const firstDir = segments[0]?.dir ?? "";
  const dir = segments.every((row) => row.dir === firstDir)
    ? firstDir
    : (segments[0]?.dir ?? "");
  const receiptPath = dir.replace(/\//g, "\\");
  const receiptFileNames = segments.map((row) => row.base).join(",");

  return { receiptPath, receiptFileNames };
}

const expenseResolutionSchema = z.object({
  resolutionDate: z.string().min(1, "결의일을 입력해주세요"),
  resolver: z.string().min(1, "결의자를 입력해주세요"),
  project: z.string(),
  approver: z.string().min(1, "승인자를 지정해주세요"),
  resolutionItem: z.string().min(1, "결의항목을 선택해주세요"),
  paymentType: z.string().min(1, "결제구분을 선택해주세요"),
  corporateCardLast4: z
    .string()
    .regex(/^\d{4}$|^$/, "카드번호 뒷자리 4자리를 입력해주세요"),
  vendor: z.string().min(1, "상호명을 입력해주세요"),
  expenseDate: z.string().min(1, "지출일을 입력해주세요"),
  summary: z
    .string()
    .refine(
      (value) =>
        getUtf8ByteLength(value) <= EXPENSE_SUMMARY_VARCHAR100_UTF8_MAX_BYTES,
      `지출내역은 MSSQL varchar(100)에 맞게 UTF-8 기준 최대 ${EXPENSE_SUMMARY_VARCHAR100_UTF8_MAX_BYTES}바이트까지 입력할 수 있습니다.`,
    ),
  supplyAmount: z.string().min(1, "공급가액을 입력해주세요"),
  vatAmount: z.string(),
});

type ExpenseResolutionFormValues = z.infer<typeof expenseResolutionSchema>;

function FieldRow({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-semibold text-gray-700">{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

function DatePickerField({
  value,
  onChange,
  placeholder = "날짜 선택",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? parseISO(value) : undefined;
  const ColoredDayButton = useMemo(() => {
    return function DayButtonColored(
      props: React.ComponentProps<typeof CalendarDayButton>,
    ) {
      const { day, modifiers, className } = props;
      const dayOfWeek = day.date.getDay();
      const isSaturday = dayOfWeek === 6;
      const isSunday = dayOfWeek === 0;

      return (
        <CalendarDayButton
          {...props}
          className={cn(
            className,
            !modifiers.selected &&
              !modifiers.disabled &&
              isSaturday &&
              "text-blue-500 hover:text-blue-600",
            !modifiers.selected &&
              !modifiers.disabled &&
              isSunday &&
              "text-red-500 hover:text-red-600",
          )}
        />
      );
    };
  }, []);

  const handleSelect = (date: Date | undefined) => {
    onChange(date ? format(date, "yyyy-MM-dd") : "");
    setOpen(false);
  };

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-11 w-full min-w-0 justify-start border-gray-200 font-normal",
            !value && "text-gray-400",
            disabled && "cursor-not-allowed bg-gray-50 text-gray-900",
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 truncate text-left">
            {value ? format(parseISO(value), "yyyy-MM-dd") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
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

export function ExpenseResolutionForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const vendorFieldRowRef = useRef<HTMLDivElement | null>(null);
  const supplyAmountFieldRowRef = useRef<HTMLDivElement | null>(null);
  const vatAmountFieldRowRef = useRef<HTMLDivElement | null>(null);
  const summaryFieldRowRef = useRef<HTMLDivElement | null>(null);
  const vendorInputRef = useRef<HTMLInputElement | null>(null);
  const supplyAmountInputRef = useRef<HTMLInputElement | null>(null);
  const vatAmountInputRef = useRef<HTMLInputElement | null>(null);
  const corporateCardLast4InputRef = useRef<HTMLInputElement | null>(null);
  const summaryTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [paymentTypeSelectOpen, setPaymentTypeSelectOpen] = useState(false);
  const [resolutionItemSelectOpen, setResolutionItemSelectOpen] =
    useState(false);
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const uploadedFilesRef = useRef<File[]>([]);
  const uploadSequenceRef = useRef(0);
  const goToMenuOnResultConfirmRef = useRef(false);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [resultDialogTitle, setResultDialogTitle] = useState("작성 완료");
  const [resultDialogDescription, setResultDialogDescription] =
    useState("지출결의서가 작성되었습니다.");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<{
    url: string;
  } | null>(null);

  const {
    data: payTypes = [],
    isLoading: isPayTypesLoading,
    isError: isPayTypesError,
  } = useQuery<ExpensePayTypeItem[]>({
    queryKey: ["expensePayTypes", user?.companyCode],
    queryFn: async () => {
      if (!user?.companyCode) return [];
      const result = await fetchExpensePayTypes(user.companyCode);
      if (result.success) return result.data;
      const fail = result as { success: false; error: string };
      throw new Error(fail.error);
    },
    enabled: !!user?.companyCode,
    staleTime: EXPENSE_REFERENCE_DATA_STALE_TIME_MS,
  });

  const {
    data: resolutionItems = [],
    isLoading: isResolutionItemsLoading,
    isError: isResolutionItemsError,
  } = useQuery({
    queryKey: ["expenseResolutionItems", user?.companyCode],
    queryFn: async () => {
      if (!user?.companyCode) return [];
      const result = await fetchExpenseResolutionItems(user.companyCode);
      if (result.success) return result.data;
      const fail = result as { success: false; error: string };
      throw new Error(fail.error);
    },
    enabled: !!user?.companyCode,
    staleTime: EXPENSE_REFERENCE_DATA_STALE_TIME_MS,
  });

  const {
    data: approvers = [],
    isLoading: isApproversLoading,
    isError: isApproversError,
  } = useQuery<ExpenseApproverItem[]>({
    queryKey: ["expenseApprovers", user?.companyCode, user?.emp_code],
    queryFn: async () => {
      if (!user?.companyCode || !user?.emp_code) return [];
      const result = await fetchExpenseApprovers(
        user.companyCode,
        user.emp_code,
      );
      if (result.success) return result.data;
      const fail = result as { success: false; error: string };
      throw new Error(fail.error);
    },
    enabled: !!user?.companyCode && !!user?.emp_code,
    staleTime: EXPENSE_REFERENCE_DATA_STALE_TIME_MS,
  });

  useExpenseProjectsQuery(user?.companyCode);

  const {
    register,
    control,
    setValue,
    setError,
    clearErrors,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseResolutionFormValues>({
    resolver: zodResolver(expenseResolutionSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      resolutionDate: today,
      resolver: user?.emp_name ?? "",
      project: "",
      approver: "",
      resolutionItem: "",
      paymentType: getInitDefaultPayTypeCode(
        queryClient.getQueryData<ExpensePayTypeItem[]>([
          "expensePayTypes",
          user?.companyCode,
        ]),
      ),
      corporateCardLast4: "",
      vendor: "",
      expenseDate: today,
      summary: "",
      supplyAmount: "",
      vatAmount: "",
    },
  });

  useEffect(() => {
    if (!payTypes.length) return;
    const code = getDefaultPayTypeCode(payTypes);
    if (!code) return;
    setValue("paymentType", code, { shouldDirty: false });
  }, [payTypes, setValue]);

  useEffect(() => {
    if (approvers.length !== 1) return;
    const only = approvers[0];
    if (!only?.approver_code) return;
    setValue("approver", only.approver_code, { shouldDirty: false });
  }, [approvers, setValue]);

  const supplyAmountWatched = watch("supplyAmount");
  const vatAmountWatched = watch("vatAmount");
  const paymentTypeWatched = watch("paymentType");
  const isCorporateCardPayment = useMemo(() => {
    if (!paymentTypeWatched) return false;
    const selectedPayType = payTypes.find(
      (row) => row.c_code === paymentTypeWatched,
    );
    return (selectedPayType?.c_name ?? "").includes("법인카드");
  }, [payTypes, paymentTypeWatched]);
  const totalAmountFormatted = useMemo(() => {
    const total =
      parseMoneyInput(supplyAmountWatched ?? "") +
      parseMoneyInput(vatAmountWatched ?? "");
    return total.toLocaleString("ko-KR");
  }, [supplyAmountWatched, vatAmountWatched]);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    if (isCorporateCardPayment) return;
    setValue("corporateCardLast4", "", { shouldDirty: true });
    clearErrors("corporateCardLast4");
  }, [clearErrors, isCorporateCardPayment, setValue]);

  const buildReceiptUploadFileName = (
    sourceFile: File,
    sequenceNumber: number,
  ): string => {
    const now = new Date();
    const dateText = toDateText(watch("resolutionDate"));
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const sequence = String(sequenceNumber).padStart(2, "0");

    const empName =
      user?.emp_name?.trim().replace(/[^0-9A-Za-z가-힣]/g, "") || "unknown";
    const empCode = user?.emp_code?.trim().replace(/[^0-9A-Za-z]/g, "") || "0";
    const extMatch = sourceFile.name.match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : ".dat";

    return `${dateText}_${empName}_${empCode}_${hh}${mm}${ss}${ms}_${sequence}${ext}`;
  };

  const onUploadFile = (file: File) => {
    if (uploadedFilesRef.current.length >= EXPENSE_RECEIPT_ATTACHMENT_MAX) {
      return;
    }

    uploadSequenceRef.current += 1;
    const renamedFile = new File(
      [file],
      buildReceiptUploadFileName(file, uploadSequenceRef.current),
      {
        type: file.type,
        lastModified: file.lastModified,
      },
    );

    setUploadedFiles((prev) => {
      if (prev.length >= EXPENSE_RECEIPT_ATTACHMENT_MAX) {
        return prev;
      }
      return [...prev, renamedFile];
    });
  };

  const onRemoveFile = (index: number) => {
    setUploadedFiles((prev) =>
      prev.filter((_, fileIndex) => fileIndex !== index),
    );
  };

  const openImagePreview = (url: string) => {
    setSelectedPreview({ url });
    setPreviewDialogOpen(true);
  };

  const filePreviewItems = useMemo(
    () =>
      uploadedFiles.map((file) => ({
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      })),
    [uploadedFiles],
  );

  useEffect(() => {
    return () => {
      filePreviewItems.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [filePreviewItems]);

  const onSubmit = async (_values: ExpenseResolutionFormValues) => {
    if (isCorporateCardPayment && !/^\d{4}$/.test(_values.corporateCardLast4)) {
      setError("corporateCardLast4", {
        type: "manual",
        message: "카드번호 뒷자리 4자리를 입력해주세요",
      });
      return;
    }

    const corpCode = user?.corp_code?.trim();
    if (!corpCode) {
      goToMenuOnResultConfirmRef.current = false;
      setResultDialogTitle("등록 실패");
      setResultDialogDescription(
        "사업장 코드를 확인할 수 없어 등록할 수 없습니다.",
      );
      setResultDialogOpen(true);
      return;
    }

    if (!user?.companyCode) {
      goToMenuOnResultConfirmRef.current = false;
      setResultDialogTitle("등록 실패");
      setResultDialogDescription(
        "회사 정보를 확인할 수 없어 등록할 수 없습니다.",
      );
      setResultDialogOpen(true);
      return;
    }

    if (!user.emp_code?.trim()) {
      goToMenuOnResultConfirmRef.current = false;
      setResultDialogTitle("등록 실패");
      setResultDialogDescription("사번을 확인할 수 없어 등록할 수 없습니다.");
      setResultDialogOpen(true);
      return;
    }

    if (!user.phoneNumber?.trim()) {
      goToMenuOnResultConfirmRef.current = false;
      setResultDialogTitle("등록 실패");
      setResultDialogDescription(
        "전화번호를 확인할 수 없어 등록할 수 없습니다.",
      );
      setResultDialogOpen(true);
      return;
    }

    let uploadedRemotePaths: string[] = [];

    if (uploadedFiles.length > 0) {
      const uploadResult = await uploadExpenseReceipts(
        user.companyCode,
        _values.resolutionDate,
        uploadedFiles,
      );

      if (!uploadResult.success) {
        goToMenuOnResultConfirmRef.current = false;
        setResultDialogTitle("영수증 전송 실패");
        setResultDialogDescription(
          "error" in uploadResult
            ? uploadResult.error
            : "영수증 업로드 중 오류가 발생했습니다.",
        );
        setResultDialogOpen(true);
        return;
      }

      uploadedRemotePaths = uploadResult.uploadedRemotePaths;
    }

    const { receiptPath, receiptFileNames } =
      buildReceiptPathAndFileNamesParam(uploadedRemotePaths);

    const resolutionDateYyyymmdd = toDateText(_values.resolutionDate);
    const expenseDateYyyymmdd = toDateText(_values.expenseDate);
    const supplyDigits = String(parseMoneyInput(_values.supplyAmount));
    const vatDigits = String(parseMoneyInput(_values.vatAmount));
    const phoneDigits = user.phoneNumber.replace(/\D/g, "");

    const insertResult = await insertExpenseResolution({
      companyCode: user.companyCode,
      corpCode,
      resolutionDateYyyymmdd,
      empCode: user.emp_code.trim(),
      projectCode: _values.project,
      approverCode: _values.approver,
      resolutionItemCode: _values.resolutionItem,
      vendor: _values.vendor,
      summary: _values.summary,
      supplyAmount: supplyDigits,
      vatAmount: vatDigits,
      paymentTypeCode: _values.paymentType,
      expenseDateYyyymmdd,
      receiptPath,
      receiptFileNames,
      phoneNumber: phoneDigits,
    });

    if (insertResult.success === false) {
      goToMenuOnResultConfirmRef.current = false;
      setResultDialogTitle("등록 실패");
      setResultDialogDescription(insertResult.error);
      setResultDialogOpen(true);
      return;
    }

    goToMenuOnResultConfirmRef.current = true;
    setResultDialogTitle("등록 완료");
    setResultDialogDescription(insertResult.message);
    setResultDialogOpen(true);
  };

  const createScrollFieldLabelIntoTop =
    (fieldRowRef: React.RefObject<HTMLDivElement | null>) => () => {
      const fieldRow = fieldRowRef.current;
      if (!fieldRow) return;

      const scrollToField = () => {
        fieldRow.scrollIntoView({
          block: "start",
          inline: "nearest",
          behavior: "smooth",
        });
      };

      scrollToField();
      window.setTimeout(scrollToField, 250);
      window.setTimeout(scrollToField, 450);
    };

  const scrollVendorFieldIntoView =
    createScrollFieldLabelIntoTop(vendorFieldRowRef);
  const scrollSupplyAmountFieldIntoView = createScrollFieldLabelIntoTop(
    supplyAmountFieldRowRef,
  );
  const scrollVatAmountFieldIntoView =
    createScrollFieldLabelIntoTop(vatAmountFieldRowRef);
  const scrollSummaryFieldIntoView =
    createScrollFieldLabelIntoTop(summaryFieldRowRef);
  const vendorFieldRegister = register("vendor");

  const handleVendorNextToPaymentType: React.KeyboardEventHandler<
    HTMLInputElement
  > = (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    setPaymentTypeSelectOpen(true);
  };
  const handleSupplyAmountNextToVatAmount: React.KeyboardEventHandler<
    HTMLInputElement
  > = (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    vatAmountInputRef.current?.focus();
  };
  const handleVatAmountNextToSummary: React.KeyboardEventHandler<
    HTMLInputElement
  > = (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    summaryTextareaRef.current?.focus();
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      method="post"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
          <FieldRow label="결의일" error={errors.resolutionDate?.message}>
            <Controller
              name="resolutionDate"
              control={control}
              render={({ field }) => (
                <DatePickerField
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="결의일을 선택하세요"
                  disabled
                />
              )}
            />
          </FieldRow>
          <FieldRow label="지출일" error={errors.expenseDate?.message}>
            <Controller
              name="expenseDate"
              control={control}
              render={({ field }) => (
                <DatePickerField
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="지출일을 선택하세요"
                />
              )}
            />
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
          <FieldRow label="결의자" error={errors.resolver?.message}>
            <Input
              className="h-11 min-w-0 border-gray-200 bg-gray-50 text-gray-900"
              {...register("resolver")}
              disabled
            />
          </FieldRow>
          <FieldRow
            label="승인자"
            error={
              isApproversError
                ? "승인자를 불러오지 못했습니다. 다시 시도해주세요."
                : errors.approver?.message
            }
          >
            <Controller
              name="approver"
              control={control}
              render={({ field }) => {
                if (isApproversLoading) {
                  return (
                    <Select disabled>
                      <SelectTrigger className="h-11 min-w-0 cursor-not-allowed border-gray-200 bg-gray-50">
                        <SelectValue placeholder="불러오는 중..." />
                      </SelectTrigger>
                    </Select>
                  );
                }

                if (isApproversError) {
                  return (
                    <Select disabled>
                      <SelectTrigger className="h-11 min-w-0 cursor-not-allowed border-gray-200 bg-gray-50">
                        <SelectValue placeholder="승인자를 불러올 수 없습니다" />
                      </SelectTrigger>
                    </Select>
                  );
                }

                if (approvers.length === 0) {
                  return (
                    <Select disabled>
                      <SelectTrigger className="h-11 min-w-0 cursor-not-allowed border-gray-200 bg-gray-50">
                        <SelectValue placeholder="등록된 승인자가 없습니다" />
                      </SelectTrigger>
                    </Select>
                  );
                }

                if (approvers.length === 1) {
                  const only = approvers[0];
                  return (
                    <Input
                      readOnly
                      disabled
                      aria-readonly
                      className="h-11 min-w-0 cursor-not-allowed border-gray-200 bg-gray-50 text-gray-900"
                      value={only?.approver_name ?? ""}
                      tabIndex={-1}
                    />
                  );
                }

                return (
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                  >
                    <SelectTrigger className="h-11 min-w-0 border-gray-200">
                      <SelectValue placeholder="승인자를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvers.map((row) => (
                        <SelectItem
                          key={row.approver_code}
                          value={row.approver_code}
                        >
                          {row.approver_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
          <FieldRow label="프로젝트" error={errors.project?.message}>
            <Controller
              name="project"
              control={control}
              render={({ field }) => (
                <ExpenseProjectPicker
                  companyCode={user?.companyCode}
                  value={field.value}
                  onValueChange={(nextValue) => {
                    field.onChange(nextValue);
                    window.setTimeout(() => {
                      vendorInputRef.current?.focus();
                    }, 10);
                  }}
                  invalid={!!errors.project}
                />
              )}
            />
          </FieldRow>
          <div
            ref={vendorFieldRowRef}
            style={{ scrollMarginTop: FIELD_SCROLL_MARGIN_TOP }}
          >
            <FieldRow label="상호명" error={errors.vendor?.message}>
              <Input
                placeholder="상호명을 입력하세요"
                className="h-11 min-w-0 border-gray-200"
                {...vendorFieldRegister}
                ref={(element) => {
                  vendorFieldRegister.ref(element);
                  vendorInputRef.current = element;
                }}
                onFocus={scrollVendorFieldIntoView}
                onKeyDown={handleVendorNextToPaymentType}
              />
            </FieldRow>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
          <FieldRow
            label="결제구분"
            error={
              isPayTypesError
                ? "결제구분을 불러오지 못했습니다. 다시 시도해주세요."
                : errors.paymentType?.message
            }
          >
            <Controller
              name="paymentType"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(nextValue) => {
                    field.onChange(nextValue);
                    setPaymentTypeSelectOpen(false);
                    const selectedPayType = payTypes.find(
                      (row) => row.c_code === nextValue,
                    );
                    const isCorporateCardSelected = (
                      selectedPayType?.c_name ?? ""
                    ).includes("법인카드");
                    window.setTimeout(() => {
                      if (isCorporateCardSelected) {
                        corporateCardLast4InputRef.current?.focus();
                        return;
                      }
                      setResolutionItemSelectOpen(true);
                    }, 10);
                  }}
                  value={field.value}
                  disabled={isPayTypesLoading}
                  open={paymentTypeSelectOpen}
                  onOpenChange={setPaymentTypeSelectOpen}
                >
                  <SelectTrigger className="h-11 min-w-0 border-gray-200">
                    <SelectValue
                      placeholder={
                        isPayTypesLoading
                          ? "불러오는 중..."
                          : payTypes.length === 0
                            ? "선택 가능한 결제구분이 없습니다"
                            : "결제구분을 선택하세요"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {payTypes.map((row, index) => (
                      <SelectItem
                        key={`${row.c_code}-${index}`}
                        value={row.c_code}
                      >
                        {row.c_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FieldRow>
          <FieldRow
            label="법인카드 번호 뒷자리"
            error={errors.corporateCardLast4?.message}
          >
            <Controller
              name="corporateCardLast4"
              control={control}
              render={({ field }) => (
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="예: 1234"
                  className="h-11 min-w-0 border-gray-200"
                  value={field.value}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={(element) => {
                    field.ref(element);
                    corporateCardLast4InputRef.current = element;
                  }}
                  disabled={!isCorporateCardPayment}
                  onChange={(event) => {
                    const nextDigits = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4);
                    field.onChange(nextDigits);
                  }}
                />
              )}
            />
          </FieldRow>
        </div>
        <div>
          <FieldRow
            label="결의항목"
            error={
              isResolutionItemsError
                ? "결의항목을 불러오지 못했습니다. 다시 시도해주세요."
                : errors.resolutionItem?.message
            }
          >
            <Controller
              name="resolutionItem"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(nextValue) => {
                    field.onChange(nextValue);
                    setResolutionItemSelectOpen(false);
                    window.setTimeout(() => {
                      supplyAmountInputRef.current?.focus();
                    }, 10);
                  }}
                  value={field.value}
                  disabled={isResolutionItemsLoading}
                  open={resolutionItemSelectOpen}
                  onOpenChange={setResolutionItemSelectOpen}
                >
                  <SelectTrigger className="h-11 min-w-0 border-gray-200">
                    <SelectValue
                      placeholder={
                        isResolutionItemsLoading
                          ? "불러오는 중..."
                          : resolutionItems.length === 0
                            ? "선택 가능한 결의항목이 없습니다"
                            : "결의항목을 선택하세요"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutionItems.map((row) => (
                      <SelectItem key={row.bslip_code} value={row.bslip_code}>
                        {row.bslip_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FieldRow>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
          <div
            ref={supplyAmountFieldRowRef}
            style={{ scrollMarginTop: FIELD_SCROLL_MARGIN_TOP }}
          >
            <FieldRow label="공급가액" error={errors.supplyAmount?.message}>
              <Controller
                name="supplyAmount"
                control={control}
                render={({ field }) => (
                  <MoneyDigitsInput
                    className="h-11 min-w-0 border-gray-200"
                    placeholder="0"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    onFocus={scrollSupplyAmountFieldIntoView}
                    onKeyDown={handleSupplyAmountNextToVatAmount}
                    name={field.name}
                    ref={(element) => {
                      field.ref(element);
                      supplyAmountInputRef.current = element;
                    }}
                  />
                )}
              />
            </FieldRow>
          </div>
          <div
            ref={vatAmountFieldRowRef}
            style={{ scrollMarginTop: FIELD_SCROLL_MARGIN_TOP }}
          >
            <FieldRow label="부가세" error={errors.vatAmount?.message}>
              <Controller
                name="vatAmount"
                control={control}
                render={({ field }) => (
                  <MoneyDigitsInput
                    className="h-11 min-w-0 border-gray-200"
                    placeholder="0"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    onFocus={scrollVatAmountFieldIntoView}
                    onKeyDown={handleVatAmountNextToSummary}
                    name={field.name}
                    ref={(element) => {
                      field.ref(element);
                      vatAmountInputRef.current = element;
                    }}
                  />
                )}
              />
            </FieldRow>
          </div>
        </div>

        <p
          className="text-right text-sm font-semibold text-gray-700"
          aria-live="polite"
        >
          금액 {totalAmountFormatted}원
        </p>

        <div
          ref={summaryFieldRowRef}
          style={{ scrollMarginTop: FIELD_SCROLL_MARGIN_TOP }}
        >
          <FieldRow label="지출내역" error={errors.summary?.message}>
            <Controller
              name="summary"
              control={control}
              render={({ field }) => (
                <div className="flex flex-col gap-1">
                  <Textarea
                    placeholder={`지출에 대한 설명을 입력하세요\n(100 바이트 내로 작성하세요)`}
                    className="min-h-[96px] resize-none border-gray-200"
                    value={field.value}
                    onBlur={field.onBlur}
                    onFocus={scrollSummaryFieldIntoView}
                    name={field.name}
                    ref={(element) => {
                      field.ref(element);
                      summaryTextareaRef.current = element;
                    }}
                    onChange={(e) => {
                      const next = truncateToUtf8ByteLength(
                        e.target.value,
                        EXPENSE_SUMMARY_VARCHAR100_UTF8_MAX_BYTES,
                      );
                      field.onChange(next);
                    }}
                  />
                  <p
                    className="text-right text-xs text-gray-500"
                    aria-live="polite"
                  >
                    {getUtf8ByteLength(field.value)} /{" "}
                    {EXPENSE_SUMMARY_VARCHAR100_UTF8_MAX_BYTES}
                  </p>
                </div>
              )}
            />
          </FieldRow>
        </div>

        <FieldRow label="영수증 첨부">
          <p className="text-xs text-gray-500">
            이미지·PDF 최대 {EXPENSE_RECEIPT_ATTACHMENT_MAX}개까지 첨부할 수
            있습니다. ({uploadedFiles.length}/{EXPENSE_RECEIPT_ATTACHMENT_MAX})
          </p>
          <div className="flex flex-wrap items-start gap-1.5">
            {uploadedFiles.length < EXPENSE_RECEIPT_ATTACHMENT_MAX ? (
              <FileUpload
                onFileChange={onUploadFile}
                accept="image/*,.pdf"
                className="h-[86px] w-[78px] rounded-lg border-gray-200 bg-gray-50 !p-0"
              >
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 py-1.5 text-center">
                  <Camera className="h-4 w-4 shrink-0 text-gray-600" />
                  <p className="text-[11px] leading-tight font-semibold text-gray-800">
                    첨부
                  </p>
                </div>
              </FileUpload>
            ) : (
              <div
                className="flex h-[86px] w-[78px] flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-1 text-center text-[10px] leading-tight text-gray-400"
                aria-live="polite"
              >
                첨부 한도
                <span className="font-semibold text-gray-500">
                  ({EXPENSE_RECEIPT_ATTACHMENT_MAX}개)
                </span>
                에 도달했습니다
              </div>
            )}
            {filePreviewItems.map(({ file, previewUrl }, index) => (
              <div
                key={`${file.name}-${index}`}
                className="relative h-[86px] w-[78px] overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="h-16 w-full object-cover"
                    onClick={() => openImagePreview(previewUrl)}
                  />
                ) : (
                  <div className="flex h-16 w-full flex-col items-center justify-center gap-0.5 bg-gray-50 px-1 text-center">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="line-clamp-2 text-[10px] text-gray-600">
                      {file.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveFile(index)}
                  className="absolute top-1 right-1 rounded-full bg-black/50 p-0.5 text-white transition-colors hover:bg-black/70"
                  aria-label={`${file.name} 삭제`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <div className="truncate border-t border-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {file.type.startsWith("image/") ? "이미지" : "첨부파일"}
                </div>
              </div>
            ))}
          </div>
        </FieldRow>
      </div>

      <div className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 gap-3 border-t border-gray-100 bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 border-gray-200 text-gray-600"
          disabled={isSubmitting}
          onClick={() => router.back()}
        >
          취소
        </Button>
        <Button
          type="submit"
          className="h-12 flex-1 gap-2 font-semibold"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              등록 중…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 shrink-0" aria-hidden />
              등록하기
            </>
          )}
        </Button>
      </div>

      {isSubmitting ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-6 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="등록 처리 중"
        >
          <div className="flex w-full max-w-[280px] flex-col items-center gap-4 rounded-2xl bg-white px-6 py-8 shadow-lg">
            <Loader2
              className="h-12 w-12 shrink-0 animate-spin text-primary"
              aria-hidden
            />
            <div className="flex flex-col gap-1 text-center">
              <p className="text-base font-semibold text-gray-900">
                등록 처리 중입니다
              </p>
              <p className="text-sm text-gray-500">
                영수증 전송 및 등록까지 잠시만 기다려 주세요
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              {resultDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {resultDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const goMenu = goToMenuOnResultConfirmRef.current;
                goToMenuOnResultConfirmRef.current = false;
                setResultDialogOpen(false);
                if (goMenu) router.replace("/menu");
              }}
            >
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={previewDialogOpen}
        onOpenChange={(open) => {
          setPreviewDialogOpen(open);
          if (!open) setSelectedPreview(null);
        }}
      >
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">
              영수증 미리보기
            </AlertDialogTitle>
          </AlertDialogHeader>
          {selectedPreview ? (
            <ReceiptImagePinchPreview imageUrl={selectedPreview.url} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setPreviewDialogOpen(false)}>
              닫기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
