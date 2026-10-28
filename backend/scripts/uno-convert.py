import os
import sys

import uno
from com.sun.star.beans import PropertyValue


def property_value(name, value):
    prop = PropertyValue()
    prop.Name = name
    prop.Value = value
    return prop


port, input_path, output_path = sys.argv[1:4]
local_context = uno.getComponentContext()
resolver = local_context.ServiceManager.createInstanceWithContext(
    "com.sun.star.bridge.UnoUrlResolver", local_context
)
context = resolver.resolve(
    f"uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext"
)
desktop = context.ServiceManager.createInstanceWithContext(
    "com.sun.star.frame.Desktop", context
)
document = desktop.loadComponentFromURL(
    uno.systemPathToFileUrl(os.path.abspath(input_path)),
    "_blank",
    0,
    (property_value("Hidden", True), property_value("ReadOnly", True)),
)
if document is None:
    raise RuntimeError("LibreOffice не открыл DOCX")
try:
    document.storeToURL(
        uno.systemPathToFileUrl(os.path.abspath(output_path)),
        (property_value("FilterName", "writer_pdf_Export"), property_value("Overwrite", True)),
    )
finally:
    document.close(True)
