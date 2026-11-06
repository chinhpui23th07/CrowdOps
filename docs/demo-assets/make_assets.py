"""Tạo tài liệu mẫu cho demo Crowd Ops: proposal PDF, ảnh bìa, hóa đơn hợp lệ và hóa đơn đáng ngờ.

Mọi file đều ghi rõ "TÀI LIỆU DEMO" để không bị nhầm với chứng từ thật.
Chạy: python docs/demo-assets/make_assets.py  (cần reportlab và Pillow)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).parent
FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Arial", str(FONT_DIR / "arial.ttf")))
pdfmetrics.registerFont(TTFont("Arial-Bold", str(FONT_DIR / "arialbd.ttf")))

TITLE = ParagraphStyle("title", fontName="Arial-Bold", fontSize=20, leading=26, spaceAfter=10)
H2 = ParagraphStyle("h2", fontName="Arial-Bold", fontSize=15, leading=20, spaceBefore=10, spaceAfter=6)
BODY = ParagraphStyle("body", fontName="Arial", fontSize=14, leading=20)
NOTE = ParagraphStyle("note", fontName="Arial", fontSize=12, leading=16, textColor=colors.HexColor("#b45309"))
DEMO_NOTE = "TÀI LIỆU DEMO - đồ án môn Blockchain (Crowd Ops). Không phải chứng từ thật."


def table(rows, widths):
    t = Table(rows, colWidths=widths)
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "Arial"),
                ("FONTNAME", (0, 0), (-1, 0), "Arial-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 13),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def pdf(name, story):
    doc = SimpleDocTemplate(str(OUT / name), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm)
    doc.build([Paragraph(DEMO_NOTE, NOTE), Spacer(1, 8)] + story)


def proposal():
    pdf(
        "proposal.pdf",
        [
            Paragraph("Proposal: Máy lọc nước cho điểm trường", TITLE),
            Paragraph("Mục tiêu: lắp 5 máy lọc nước cho điểm trường vùng cao, phục vụ khoảng 120 học sinh.", BODY),
            Paragraph("1. Ngân sách dự kiến", H2),
            table(
                [
                    ["Hạng mục", "Số lượng", "Tỷ lệ ngân sách"],
                    ["Máy lọc nước RO", "5 máy", "40%"],
                    ["Lắp đặt, đường ống", "1 gói", "25%"],
                    ["Bảo trì 12 tháng", "1 gói", "20%"],
                    ["Dự phòng", "-", "15%"],
                ],
                [7 * cm, 4 * cm, 5 * cm],
            ),
            Paragraph("2. Tiến độ", H2),
            Paragraph("Tuần 1-2: khảo sát và mua máy. Tuần 3: lắp đặt. Tuần 4: bàn giao, báo cáo kèm hóa đơn.", BODY),
            Paragraph("3. Cam kết minh bạch", H2),
            Paragraph(
                "Mọi khoản chi đều được tạo thành yêu cầu chi trên smart contract kèm hóa đơn lưu trên IPFS, "
                "và chỉ được giải ngân khi người ủng hộ biểu quyết đồng ý trên 50% tổng quyền.",
                BODY,
            ),
        ],
    )


def invoice(name, title, rows, note):
    pdf(
        name,
        [
            Paragraph(title, TITLE),
            Paragraph(note, BODY),
            Spacer(1, 8),
            table([["Nội dung", "Số lượng", "Thành tiền"]] + rows, [8 * cm, 3 * cm, 5 * cm]),
        ],
    )


def cover():
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), "#060912")
    draw = ImageDraw.Draw(img)
    for x in range(w):  # nền gradient cyan -> tím
        t = x / w
        color = (int(34 + (168 - 34) * t), int(211 + (85 - 211) * t), int(238 + (247 - 238) * t))
        draw.line([(x, 0), (x, h)], fill=tuple(int(c * 0.35) for c in color))
    for i in range(5):  # 5 "máy lọc nước" dạng khối
        x0 = 140 + i * 190
        draw.rounded_rectangle([x0, 300, x0 + 130, 520], radius=18, outline="#22d3ee", width=5)
        draw.ellipse([x0 + 45, 340, x0 + 85, 380], fill="#67e8f9")
    bold = ImageFont.truetype(str(FONT_DIR / "arialbd.ttf"), 64)
    small = ImageFont.truetype(str(FONT_DIR / "arial.ttf"), 30)
    draw.text((70, 70), "Máy lọc nước cho điểm trường", font=bold, fill="white")
    draw.text((70, 160), "Crowd Ops · ảnh minh họa cho demo", font=small, fill="#cbd5e1")
    img.save(OUT / "cover.png")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # terminal Windows mặc định cp1252
    proposal()
    invoice(
        "invoice.pdf",
        "Hóa đơn: Mua 5 máy lọc nước",
        [["Máy lọc nước RO 10 lõi", "5", "4 đơn vị ETH demo"]],
        "Nhà cung cấp: Công ty thiết bị nước (giả lập cho demo). Đã kèm mã máy và bảo hành 12 tháng.",
    )
    invoice(
        "suspicious-invoice.pdf",
        "Hóa đơn: Chi phí marketing",
        [["Chi phí quảng bá (không ghi rõ)", "1", "9 đơn vị ETH demo"]],
        "Không ghi rõ nhà cung cấp, không có chi tiết - dùng cho kịch bản yêu cầu chi đáng ngờ bị bác bỏ.",
    )
    cover()
    print("Đã tạo:", ", ".join(p.name for p in sorted(OUT.glob("*.p*"))))
