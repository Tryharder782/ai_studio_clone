# -*- mode: python ; coding: utf-8 -*-
import sys
import os

block_cipher = None

# Define paths relative to the spec file location (backend/)
backend_dir = os.getcwd()
project_root = os.path.dirname(backend_dir)
frontend_dist = os.path.join(project_root, 'frontend', 'dist')

# Collect .env if it exists at project root
extra_datas = [
    (frontend_dist, 'frontend/dist'),
]
env_file = os.path.join(project_root, '.env')
if os.path.exists(env_file):
    extra_datas.append((env_file, '.'))

a = Analysis(
    ['desktop_main.py'],
    pathex=[backend_dir],
    binaries=[],
    datas=extra_datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.responses',
        'starlette.websockets',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        'httptools',
        'httptools.parser',
        'httptools.parser.parser',
        'websockets',
        'wsproto',
        'main',
        'sync_drive',
        'google.genai',
        'google.genai.types',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='AI Studio',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='AI Studio',
)
