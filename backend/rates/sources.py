"""
Lectura de las tasas desde fuera: la página del BCV y el histórico de DolarAPI.

Todo lo que puede fallar (red, página cambiada, datos raros) termina en
`SourceError`, para que quien llama solo tenga que atrapar una excepción.
"""
import datetime
import ssl
from decimal import Decimal, InvalidOperation
from pathlib import Path

import certifi
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter

BCV_URL = "https://www.bcv.org.ve/"
HISTORY_URLS = {
    "USD": "https://ve.dolarapi.com/v1/historicos/dolares/oficial",
    "EUR": "https://ve.dolarapi.com/v1/historicos/euros/oficial",
}
# En qué bloque de la página del BCV está cada moneda (<div id="dolar">).
BCV_BLOCKS = {"USD": "dolar", "EUR": "euro"}
TIMEOUT_SECONDS = 10


class SourceError(Exception):
    """No se pudo obtener o entender la tasa."""


# El servidor del BCV envía un certificado intermedio equivocado: falta el que
# firmó el suyo (Sectigo DV R36). Windows lo descarga solo, pero Linux, donde
# corre en producción, no, y rechaza la conexión (spec 012). Se guarda aquí y
# se añade a los certificados de siempre: se sigue verificando todo.
EXTRA_INTERMEDIATE = Path(__file__).parent / "certs" / "sectigo-dv-r36.pem"


class CertificatesAdapter(HTTPAdapter):
    """Valida con los certificados de certifi más el intermedio que el BCV no envía."""

    def init_poolmanager(self, *args, **kwargs):
        context = ssl.create_default_context(cafile=certifi.where())
        context.load_verify_locations(cafile=EXTRA_INTERMEDIATE)
        kwargs["ssl_context"] = context
        return super().init_poolmanager(*args, **kwargs)


def download(url):
    session = requests.Session()
    session.mount("https://", CertificatesAdapter())
    try:
        response = session.get(url, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException as error:
        raise SourceError(f"No se pudo leer {url}: {error}") from error
    return response


def to_decimal(text):
    """'1.234,56789' (formato venezolano) -> Decimal('1234.56789')."""
    try:
        value = Decimal(text.strip().replace(".", "").replace(",", "."))
    except InvalidOperation as error:
        raise SourceError(f"Tasa con formato inesperado: {text!r}") from error
    if value <= 0:
        raise SourceError(f"Tasa no válida: {text!r}")
    return value


def parse_bcv_page(html):
    """Saca de la página del BCV la Fecha Valor y las tasas: (fecha, {código: Decimal})."""
    soup = BeautifulSoup(html, "html.parser")

    date_tag = soup.find("span", class_="date-display-single")
    if date_tag is None or not date_tag.get("content"):
        raise SourceError("No se encontró la Fecha Valor en la página del BCV.")
    # content="2026-10-14T00:00:00-04:00": basta con la fecha.
    try:
        date = datetime.date.fromisoformat(date_tag["content"][:10])
    except ValueError as error:
        raise SourceError("Fecha Valor con formato inesperado.") from error

    rates = {}
    for code, block_id in BCV_BLOCKS.items():
        value_tag = soup.select_one(f"#{block_id} strong")
        if value_tag is None:
            raise SourceError(f"No se encontró la tasa de {code} en la página del BCV.")
        rates[code] = to_decimal(value_tag.get_text())
    return date, rates


def read_bcv():
    """La tasa vigente publicada hoy en la página del BCV."""
    return parse_bcv_page(download(BCV_URL).text)


def read_history():
    """Histórico de DolarAPI: {fecha: {código: Decimal}}."""
    history = {}
    for code, url in HISTORY_URLS.items():
        try:
            rows = download(url).json()
            for row in rows:
                date = datetime.date.fromisoformat(row["fecha"])
                history.setdefault(date, {})[code] = Decimal(str(row["promedio"]))
        except (ValueError, KeyError, TypeError, InvalidOperation) as error:
            raise SourceError("El histórico de DolarAPI tiene un formato inesperado.") from error
    return history
