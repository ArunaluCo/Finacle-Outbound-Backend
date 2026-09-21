-- =====================================================================
-- Lab test data for the VAM mock (Findem25 / EPAS; works on Oracle too)
-- Value date 21-09-2026 - change it to today's BOD date in the lab.
-- Uses the test VA numbers from the mock's status page. Lab only, never UAT/PROD.
-- =====================================================================

-- Bulk validation source: one row per scenario VA
INSERT INTO custom.c_va_islips_ac_dtl (va_num, txn_val_date, real_acct_num, is_valid, val_failed_reason, del_flg, rcre_time)
SELECT v.va_num, TO_DATE('21-09-2026','DD-MM-YYYY'), NULL, NULL, NULL, 'N', SYSDATE
  FROM (SELECT '800000000001' AS va_num FROM DUAL UNION ALL SELECT '800000000002' FROM DUAL UNION ALL
        SELECT '800000000003' FROM DUAL UNION ALL SELECT '800000000004' FROM DUAL UNION ALL
        SELECT '800000000005' FROM DUAL UNION ALL SELECT '800000000006' FROM DUAL UNION ALL
        SELECT '800000000007' FROM DUAL UNION ALL SELECT '800000000008' FROM DUAL UNION ALL
        SELECT '800000000009' FROM DUAL UNION ALL SELECT '800000000010' FROM DUAL UNION ALL
        SELECT '800000000123' FROM DUAL) v;

-- Batch failure test: add this row on a separate date, it makes the whole batch time out
-- INSERT INTO custom.c_va_islips_ac_dtl (va_num, txn_val_date, del_flg, rcre_time) VALUES ('899999999901', TO_DATE('22-09-2026','DD-MM-YYYY'), 'N', SYSDATE);

-- Ledger source: one credit row per scenario (VA leg = va_num, counter leg = real_acct_num)
INSERT INTO custom.c_va_txn_audit_dtl (oper_date, mop_id, tran_id, tran_date, value_date, tran_ccy, tran_amt, part_tran_srl_num,
  part_tran_type, va_num, real_acct_num, fx_rate, tran_particulars, tran_code, init_sol, bank_code, branch_code, tran_status,
  entered_by, entered_date, verified_by, verified_date, vam_update_status, vam_update_error_msg, entity_cre_flg, del_flg, rcre_time, lchng_time)
SELECT TO_DATE('21-09-2026','DD-MM-YYYY'), 'MOCK', v.tran_id, TO_DATE('21-09-2026','DD-MM-YYYY'), TO_DATE('21-09-2026','DD-MM-YYYY'),
       'LKR', v.amt, 1, 'C', v.va_num, '102030405060', 1, v.note, NULL, '001', '7010', '012', 'POSTED',
       'LABUSER', SYSDATE, 'LABUSER', SYSDATE, 'Pending', NULL, 'Y', 'N', SYSDATE, SYSDATE
  FROM (SELECT 'M0000001' AS tran_id, '800000000001' AS va_num, 1500.50 AS amt, 'success' AS note FROM DUAL UNION ALL
        SELECT 'M0000002', '899999999922', 2500.00, 'late success - reconciles' FROM DUAL UNION ALL
        SELECT 'M0000003', '899999999921', 100.00, 'fails once - replay' FROM DUAL UNION ALL
        SELECT 'M0000004', '899999999926', 200.00, 'always fails' FROM DUAL UNION ALL
        SELECT 'M0000005', '800000000008', 300.00, 'closed VA' FROM DUAL UNION ALL
        SELECT 'M0000006', '899999999927', 400.00, 'posted, bad reply' FROM DUAL) v;
COMMIT;

-- Clean up (lab only)
-- DELETE FROM custom.c_va_islips_ac_dtl WHERE va_num LIKE '8000000000%' OR va_num LIKE '8999999999%';
-- DELETE FROM custom.c_va_txn_audit_dtl WHERE mop_id = 'MOCK';
-- COMMIT;
