export function microphoneErrorMessage(errorName?: string): string {
  switch (errorName) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "صلاحية الميكروفون غير مفعّلة. اسمح بها من نافذة الإذن، أو من إعدادات الهاتف/المتصفح ثم أعد المحاولة.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "لم نعثر على ميكروفون متاح على هذا الجهاز.";
    case "NotReadableError":
    case "TrackStartError":
      return "الميكروفون مستخدم من تطبيق آخر أو غير جاهز. أغلق التطبيق الآخر ثم حاول مجدداً.";
    case "AbortError":
      return "تم إيقاف طلب الميكروفون قبل بدء التسجيل. حاول مرة أخرى.";
    default:
      return "تعذر بدء التسجيل. تحقق من صلاحية الميكروفون واتصال التطبيق ثم حاول مجدداً.";
  }
}
