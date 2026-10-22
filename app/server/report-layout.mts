import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { ReportBase } from "../features/documentos/domain/common.ts";
import { reportDate } from "./report-format.mts";

const asset = (name: string) => fileURLToPath(new URL("../assets/reports/" + name, import.meta.url));
export class ReportLayout {
  readonly doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, autoFirstPage: false });
  readonly width = 511.28;
  y = 0;
  private readonly chunks: Buffer[] = [];
  private readonly completion: Promise<Buffer>;
  readonly report: ReportBase;
  readonly watermark: string;
  constructor(report: ReportBase, watermark = "") {
    this.report = report;
    this.watermark = watermark;
    this.doc.registerFont("regular", asset("NotoSans-Regular.ttf"));
    this.doc.registerFont("bold", asset("NotoSans-Bold.ttf"));
    this.doc.info.Title = report.title + " · " + report.code;
    this.doc.info.Author = report.company.name;
    this.doc.info.CreationDate = new Date(report.generatedAt);
    this.completion = new Promise((resolve, reject) => {
      this.doc.on("data", (chunk: Buffer) => this.chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
    });
    this.page();
    const contact = [report.company.taxId, report.company.address, report.company.phone, report.company.email]
      .filter(Boolean)
      .join(" · ");
    if (report.company.name.length > 80 || contact.length > 180)
      this.text("Datos de la empresa: " + report.company.name + " · " + contact);
  }
  page() {
    this.doc.addPage();
    if (this.watermark) {
      this.doc
        .save()
        .opacity(0.08)
        .font("bold")
        .fontSize(26)
        .fillColor("#334d60")
        .rotate(-35, { origin: [300, 420] })
        .text(this.watermark, 65, 400, { lineBreak: false })
        .restore();
    }
    this.doc.image(asset("logo.jpg"), 42, 35, { fit: [58, 40] });
    this.doc
      .font("bold")
      .fontSize(13)
      .fillColor("#1c3547")
      .text(this.report.company.name, 112, 36, { width: 440, height: 36, ellipsis: true });
    this.doc
      .font("regular")
      .fontSize(8)
      .fillColor("#394753")
      .text(
        [
          this.report.company.taxId,
          this.report.company.address,
          this.report.company.phone,
          this.report.company.email,
        ]
          .filter(Boolean)
          .join(" · "),
        112,
        this.doc.y + 3,
        { width: 440, height: 30, ellipsis: true },
      );
    this.y = Math.max(90, this.doc.y + 18);
    this.doc.font("bold").fontSize(17).text(this.report.title, 42, this.y, { width: this.width });
    this.y = this.doc.y + 5;
    this.doc
      .font("regular")
      .fontSize(9)
      .text(this.report.code + " · Fecha: " + reportDate(this.report.date, this.report.timezone), 42, this.y);
    this.y = this.doc.y + 16;
  }
  ensure(height: number) {
    if (this.y + height > 770) this.page();
  }
  text(value: string, bold = false) {
    if (bold) this.ensure(100);
    // Explicit line wrapping also handles a single note longer than a page.
    this.doc.font(bold ? "bold" : "regular").fontSize(bold ? 11 : 9);
    const words = String(value || "—").split(/\s+/);
    let line = "";
    for (const word of words) {
      // Split unbroken identifiers so external content cannot escape the printable width.
      const parts: string[] = [];
      let part = "";
      for (const character of word) {
        if (part && this.doc.widthOfString(part + character) > this.width) {
          parts.push(part);
          part = "";
        }
        part += character;
      }
      if (part) parts.push(part);
      for (const part of parts) {
        const next = line ? line + " " + part : part;
        if (line && this.doc.widthOfString(next) > this.width) {
          this.line(line, bold);
          line = part;
        } else line = next;
      }
    }
    if (line) this.line(line, bold);
    this.y += bold ? 7 : 5;
  }
  private line(value: string, bold: boolean) {
    this.ensure(17);
    this.doc
      .font(bold ? "bold" : "regular")
      .fontSize(bold ? 11 : 9)
      .fillColor("#202c35")
      .text(value, 42, this.y, { width: this.width, lineBreak: false });
    this.y += bold ? 17 : 14;
  }
  table(headers: string[], rows: string[][], weights: number[] = headers.map(() => 1)) {
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((weight) => (this.width * weight) / total);
    const draw = (cells: string[], header = false) => {
      this.doc.font(header ? "bold" : "regular").fontSize(8);
      const height =
        Math.max(...cells.map((cell, i) => this.doc.heightOfString(cell || "—", { width: widths[i] - 12 }))) +
        14;
      if (height > 560) {
        cells.forEach((cell, i) => this.text(headers[i] + ": " + cell));
        return;
      }
      if (this.y + height > 770) {
        this.page();
        if (!header) draw(headers, true);
      }
      // Extremely long entries use the paginated text flow instead of clipping a table row.
      if (this.y + height > 770) {
        cells.forEach((cell, i) => this.text(headers[i] + ": " + cell));
        return;
      }
      if (header) this.doc.rect(42, this.y, this.width, height).fill("#e7edf1");
      let x = 42;
      cells.forEach((cell, i) => {
        this.doc
          .font(header ? "bold" : "regular")
          .fontSize(8)
          .fillColor("#202c35")
          .text(cell || "—", x + 6, this.y + 6, { width: widths[i] - 12 });
        x += widths[i];
      });
      this.y += height;
      this.doc
        .moveTo(42, this.y)
        .lineTo(42 + this.width, this.y)
        .lineWidth(0.4)
        .strokeColor("#b8c4cc")
        .stroke();
    };
    this.ensure(65);
    draw(headers, true);
    if (!rows.length) draw(["Sin registros", ...headers.slice(1).map(() => "")]);
    rows.forEach((row) => draw(row));
    this.y += 14;
  }
  async finish() {
    const { count } = this.doc.bufferedPageRange();
    for (let page = 0; page < count; page++) {
      this.doc.switchToPage(page);
      this.doc
        .font("regular")
        .fontSize(7)
        .fillColor("#394753")
        .text(
          `Generado: ${reportDate(this.report.generatedDate, this.report.timezone)} · Página ${page + 1} de ${count}`,
          42,
          782,
          {
            width: this.width,
            lineBreak: false,
          },
        );
    }
    this.doc.end();
    return this.completion;
  }
}
