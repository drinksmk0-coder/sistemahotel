@echo off
REM cleanup.bat - remove os arquivos orfaos/duplicados da RAIZ do repo sistemahotel.
REM Mesma logica do cleanup.sh, adaptada para cmd.exe / Windows.
REM
REM Uso:
REM   cleanup.bat            (dry-run - so mostra o que seria removido)
REM   cleanup.bat --apply    (remove de fato via "git rm")

setlocal enabledelayedexpansion

set APPLY=0
if "%~1"=="--apply" set APPLY=1

set COUNT=0
set MISSING=0

for %%F in (
  "20260710220502_715dffb4-fdc7-41d0-958b-2a853445b08d.sql"
  "20260710221618_a55577db-41f4-42f0-b42e-261b8ac7ee4e.sql"
  "20260711175615_9820e15d-fcb3-44cc-b774-d68c54b2842f.sql"
  "20260711175641_b65ec4ed-bdb4-49bc-a0de-5db41acc8190.sql"
  "20260711181312_51737d77-9304-445a-98a4-2dc3b351bf93.sql"
  "20260712031539_67346acc-937b-4312-8736-6f4b0bc18f57.sql"
  "20260713042814_5433f7af-9865-40c2-a6f8-63115cde8263.sql"
  "20260713162000_seed_rooms_and_unique_cpf.sql"
  "20260713190000_reservation_times_products_inventory.sql"
  "20260713200000_external_reservation_integrations.sql"
  "20260714103000_saas_multi_company_foundation.sql"
  "20260715135000_security_feedbacks_profiles_guest_fields.sql"
  "20260715143000_sales_partial_payment_housekeeping_notes.sql"
  "20260715162000_kitchen_cafe_operations.sql"
  "20260715165000_kitchen_cafe_read_policy.sql"
  "20260716120000_client_required_identity_fields.sql"
  "AppLayout.tsx"
  "README.md"
  "__root.tsx"
  "accordion.tsx"
  "alert-dialog.tsx"
  "alert.tsx"
  "aspect-ratio.tsx"
  "auth-attacher.ts"
  "auth-middleware.ts"
  "auth.tsx"
  "avaliar.tsx"
  "avatar.tsx"
  "badge.tsx"
  "breadcrumb.tsx"
  "button.tsx"
  "cadastro-empresa.tsx"
  "calendar.tsx"
  "card.tsx"
  "carousel.tsx"
  "chart.tsx"
  "checkbox.tsx"
  "client.server.ts"
  "client.ts"
  "clientes.tsx"
  "collapsible.tsx"
  "command.tsx"
  "config.toml"
  "constants.ts"
  "context-menu.tsx"
  "dashboard-estrategico.tsx"
  "data.ts"
  "deno.json"
  "despesas.tsx"
  "dialog.tsx"
  "download"
  "download (1)"
  "download (2)"
  "download (4)"
  "drawer.tsx"
  "dropdown-menu.tsx"
  "empresa.tsx"
  "env.example"
  "equipe.tsx"
  "error-capture.ts"
  "error-page.ts"
  "favicon.ico"
  "form.tsx"
  "format.ts"
  "hotel-real-logo.png"
  "hotel_real_importar_historico.sql"
  "hover-card.tsx"
  "imprimir.tsx"
  "index.ts"
  "index.tsx"
  "input-otp.tsx"
  "input.tsx"
  "integracoes.tsx"
  "label.tsx"
  "lovable-error-reporting.ts"
  "manifest.webmanifest"
  "mapa.tsx"
  "menubar.tsx"
  "navigation-menu.tsx"
  "pagination.tsx"
  "painel.tsx"
  "popover.tsx"
  "progress.tsx"
  "project.json"
  "pwa.ts"
  "qrcodes.tsx"
  "radio-group.tsx"
  "reclamacoes.tsx"
  "reservas.tsx"
  "resizable.tsx"
  "robots.txt"
  "route.tsx"
  "routeTree.gen.ts"
  "scroll-area.tsx"
  "select.tsx"
  "separator.tsx"
  "server.ts"
  "sheet.tsx"
  "sidebar.tsx"
  "sistemahotel-completo-revisado-v4 (2).zip"
  "sitemap[.]xml.ts"
  "skeleton.tsx"
  "slider.tsx"
  "sonner.tsx"
  "start.ts"
  "styles.css"
  "sw.js"
  "switch.tsx"
  "table.tsx"
  "tabs.tsx"
  "textarea.tsx"
  "toggle-group.tsx"
  "toggle.tsx"
  "tooltip.tsx"
  "types.ts"
  "ui-kit.tsx"
  "use-auth.ts"
  "use-inspector-guard.ts"
  "use-mobile.tsx"
  "utils.ts"
  "vendas.tsx"
) do (
  if exist %%F (
    if !APPLY!==1 (
      git rm -q -- %%F
      echo removido: %%F
    ) else (
      echo [dry-run] removeria: %%F
    )
    set /a COUNT+=1
  ) else (
    set /a MISSING+=1
  )
)

echo.
echo Total: !COUNT! arquivo(s) processado(s), !MISSING! ja ausente(s).
echo.
if !APPLY!==1 (
  echo Pronto. Revise com "git status" antes de commitar.
) else (
  echo Isto foi um DRY-RUN. Nada foi apagado.
  echo Para aplicar de verdade, rode:  cleanup.bat --apply
)

endlocal
