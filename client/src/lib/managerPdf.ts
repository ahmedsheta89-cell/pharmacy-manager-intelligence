/**
 * نبض العيادة التنفيذي — تصدير تقرير المدير.
 * يُحوِّل المستند المرئي نفسه إلى PDF عالي الدقة حتى تبقى العربية والرسوم
 * متطابقة مع التقرير المعروض، ولا يغادر أيّ من بيانات الصيدلية المتصفح.
 */
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

export interface ManagerPdfOptions {
  footerLabel?: string;
}

export async function exportManagerReportPdf(reportElement: HTMLElement, fileName: string, options: ManagerPdfOptions = {}) {
  const fontReady = document.fonts?.ready ?? Promise.resolve();
  await Promise.race([fontReady, new Promise<void>((resolve) => window.setTimeout(resolve, 1800))]);

  const canvas = await toCanvas(reportElement, {
    backgroundColor: "#fcfcf8",
    pixelRatio: Math.min(Math.max(window.devicePixelRatio || 1, 1.25), 1.5),
    cacheBust: false,
    skipFonts: true,
    width: reportElement.scrollWidth,
    height: reportElement.scrollHeight,
  });

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const margin = 7;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const sourcePageHeight = Math.floor((printableHeight * canvas.width) / printableWidth);
  let sourceY = 0;
  let pageNumber = 0;

  while (sourceY < canvas.height) {
    const cropHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = cropHeight;
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز صفحة التقرير للتصدير.");
    context.fillStyle = "#fcfcf8";
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(canvas, 0, sourceY, canvas.width, cropHeight, 0, 0, canvas.width, cropHeight);

    if (pageNumber > 0) pdf.addPage();
    const pageImageHeight = (cropHeight * printableWidth) / canvas.width;
    pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.96), "JPEG", margin, margin, printableWidth, pageImageHeight, undefined, "FAST");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 130, 121);
    pdf.text(`${options.footerLabel ?? "Pharmacy Manager Intelligence"}  |  ${pageNumber + 1}`, pageWidth / 2, pageHeight - 3, { align: "center" });
    sourceY += cropHeight;
    pageNumber += 1;
  }

  pdf.save(fileName);
}
