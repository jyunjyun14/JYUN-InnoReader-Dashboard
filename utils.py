import re
import io
import pandas as pd


def strip_html_tags(html: str) -> str:
    """HTML 태그를 제거하고 텍스트만 반환."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def dataframe_to_excel(df: pd.DataFrame) -> bytes:
    """DataFrame을 xlsx 바이트로 변환. 헤더 서식 적용."""
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Articles")
        workbook = writer.book
        worksheet = writer.sheets["Articles"]

        header_fmt = workbook.add_format(
            {"bold": True, "bg_color": "#4472C4", "font_color": "#FFFFFF"}
        )
        for col_idx, col_name in enumerate(df.columns):
            worksheet.write(0, col_idx, col_name, header_fmt)
            max_len = max(df[col_name].astype(str).str.len().max(), len(col_name)) + 2
            max_len = min(max_len, 60)
            worksheet.set_column(col_idx, col_idx, max_len)

    return output.getvalue()


def dataframes_to_excel(sheets: dict[str, pd.DataFrame]) -> bytes:
    """여러 DataFrame을 시트별로 나눈 xlsx 바이트로 변환."""
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        for sheet_name, df in sheets.items():
            # 시트 이름 31자 제한
            safe_name = sheet_name[:31]
            df.to_excel(writer, index=False, sheet_name=safe_name)

            workbook = writer.book
            worksheet = writer.sheets[safe_name]

            header_fmt = workbook.add_format(
                {"bold": True, "bg_color": "#4472C4", "font_color": "#FFFFFF"}
            )
            for col_idx, col_name in enumerate(df.columns):
                worksheet.write(0, col_idx, col_name, header_fmt)
                max_len = max(
                    df[col_name].astype(str).str.len().max(), len(str(col_name))
                ) + 2
                max_len = min(max_len, 60)
                worksheet.set_column(col_idx, col_idx, max_len)

    return output.getvalue()
