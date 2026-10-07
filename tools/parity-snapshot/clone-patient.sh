#!/usr/bin/env bash
# Phase B (thao tác GHI DB) — nhân bản 1 bệnh nhân sang số mới trên CẢ HAI DB, để WinForm và
# web ghi vào bản sao giống hệt nhau rồi dọn sạch, không đụng bệnh nhân thật.
#
#   tools/parity-snapshot/clone-patient.sh 3948 993948          # tạo (xoá bản cũ của 993948 trước)
#   tools/parity-snapshot/clone-patient.sh --drop 993948        # dọn
#
# SQL Server: container ochacom_sql2022 (cổng 1434 — MENU.exe đọc, theo C:\NEW_SIM2000\Ocha.xml).
# Postgres:   container ochacom_postgres, schema t_tenant1.
# An toàn: chỉ chấp nhận số đích >= 990000 (dải seed test).
set -euo pipefail

# Bảng có khoá chính KHÔNG chứa PAT_NO (SUM_TSK, ACCDAT_BILL, YOYAKU, RCP_STATUSINF) không chép được
# (trùng khoá) và không cần cho 診療入力; OQS_* / RX_* ngoài phạm vi.
MS_TABLES="BNOW CCTLINE INSURANCE KON MEDINSINF MISOU NCULT PATINFO PERSON PERSON_EXP SIGA TRN_STATUS TRNTRN TRTSTATE PUBEXPINF ACCDAT PCONDITION CCTA"
PG_TABLES="bnow insurance kon med_ins_inf misou ncult pat_info person person_exp siga trn_status trn_trn pub_exp_inf acc_dat p_condition ccta"

ms() { docker exec -i ochacom_sql2022 bash -lc '$(ls -d /opt/mssql-tools*/bin|head -1)/sqlcmd -S localhost -U sa -P tmdu -C -d SIM2000 -b -W -h -1 -Q "$0"' "$1"; }
# -y 0: không cắt cột nvarchar(max) (danh sách cột dài hơn độ rộng mặc định). Không đi cùng -W.
msx() { docker exec -i ochacom_sql2022 bash -lc '$(ls -d /opt/mssql-tools*/bin|head -1)/sqlcmd -S localhost -U sa -P tmdu -C -d SIM2000 -b -y 0 -Q "$0"' "$1" | tr -d '\r' | sed 's/[[:space:]]*$//' | awk 'NF' | tail -n 1; }
pg() { docker exec -i ochacom_postgres psql -U ochacom -d ochacom-dev -At -v ON_ERROR_STOP=1 -c "$1"; }

drop() {
    local dst=$1
    for t in $MS_TABLES; do ms "SET NOCOUNT ON; DELETE FROM $t WHERE PAT_NO=$dst"; done
    for t in $PG_TABLES; do pg "DELETE FROM t_tenant1.$t WHERE pat_no=$dst" >/dev/null; done
    # trn_status / person_exp… của web còn có thể bị F9 ghi thêm bảng khác — quét mọi bảng có pat_no.
    pg "DO \$\$DECLARE r record; BEGIN FOR r IN SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema='t_tenant1' AND c.column_name='pat_no' AND t.table_type='BASE TABLE'
          AND c.data_type IN ('integer','bigint','smallint')
        LOOP EXECUTE format('DELETE FROM t_tenant1.%I WHERE pat_no=$dst', r.table_name); END LOOP; END\$\$" >/dev/null
    for t in $(ms "SET NOCOUNT ON; SELECT t.name FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE c.name='PAT_NO' AND TYPE_NAME(c.system_type_id) IN ('int','smallint','bigint','numeric','decimal')"); do
        ms "SET NOCOUNT ON; DELETE FROM $t WHERE PAT_NO=$dst"
    done
}

if [[ ${1:-} == --drop ]]; then
    DST=${2:?usage: clone-patient.sh --drop <dst>}
    (( DST >= 990000 )) || { echo "✘ chỉ dọn số >= 990000"; exit 2; }
    drop "$DST"; echo "✔ đã dọn $DST trên hai DB"; exit 0
fi

SRC=${1:?usage: clone-patient.sh <src> <dst>}
DST=${2:?usage: clone-patient.sh <src> <dst>}
(( DST >= 990000 )) || { echo "✘ số đích phải >= 990000"; exit 2; }
drop "$DST"

for t in $MS_TABLES; do
    # Mọi cột trừ IDENTITY (TRNTRN.SEQ); PAT_NO thay bằng số đích.
    cols=$(msx "SET NOCOUNT ON; SELECT STRING_AGG(CAST(QUOTENAME(name) AS nvarchar(max)), ',') FROM sys.columns WHERE object_id=OBJECT_ID('$t') AND is_identity=0 AND is_computed=0")
    sel=${cols//\[PAT_NO\]/$DST AS [PAT_NO]}
    ms "SET NOCOUNT ON; INSERT INTO $t ($cols) SELECT $sel FROM $t WHERE PAT_NO=$SRC"
done

for t in $PG_TABLES; do
    # Mọi cột trừ id (uuid tự sinh); pat_no thay bằng số đích; seq của trn_trn chép nguyên
    # (khoá là id, seq không unique — xem TrnTrnConfiguration).
    pg "DO \$\$DECLARE cols text; sel text; BEGIN
        SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position),
               string_agg(CASE column_name WHEN 'pat_no' THEN '$DST' ELSE quote_ident(column_name) END, ',' ORDER BY ordinal_position)
          INTO cols, sel FROM information_schema.columns
         WHERE table_schema='t_tenant1' AND table_name='$t' AND column_name <> 'id';
        EXECUTE format('INSERT INTO t_tenant1.%I (%s) SELECT %s FROM t_tenant1.%I WHERE pat_no=$SRC', '$t', cols, sel, '$t');
    END\$\$" >/dev/null
done

echo "trntrn: SQL Server $(ms "SET NOCOUNT ON; SELECT COUNT(*) FROM TRNTRN WHERE PAT_NO=$DST") dòng, Postgres $(pg "SELECT count(*) FROM t_tenant1.trn_trn WHERE pat_no=$DST AND deleted_at IS NULL") dòng"
