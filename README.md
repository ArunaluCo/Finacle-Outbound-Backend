# vam-mock — Lab එකට VAM API mock එක (Node.js)

Lab එකට Sampath VAM / APIM එක ලැබෙන්නේ නැති නිසා මේ project එක ඒ වෙනුවට වැඩ කරනවා. මේ server එක:
- **APIs 4 ම** එකම paths සහ payloads වලින් දෙනවා: APIM token එක සහ Intellect VAM APIs 3 (single, bulk, ledger). ඒ නිසා Finacle පැත්තේ වෙනස් කරන්න තියෙන්නේ setvar URLs විතරයි.
- **Database එකක් නෑ.** Test data එන්නේ fixed VA numbers වලින්.
- **Dependencies නෑ.** Node 18+ විතරයි ඕන. `npm install` කරන්න ඕන නෑ.
- **`/` URL එක browser එකෙන් open කළාම** ✓ **RUNNING** stamp එකක් එක්ක status page එකක් පෙන්නනවා. Page එකේ තියෙන දේවල්:
  - Finacle setvar එකට දාන්න ඕන URLs
  - Calls ගණන් සහ අන්තිම calls 50
  - Test VA numbers table එක

## 1. Local run සහ test

```bash
npm start            # http://localhost:8080  (browser එකෙන් open කරලා RUNNING page එක බලන්න)
npm test             # scenarios 15 ම test කරනවා
```

Finacle Java එක `https://` විතරයි පිළිගන්නේ. ඒ නිසා Finacle එක්ක test කරන්න Railway (කොටස 2) හෝ lab HTTPS mode එක (කොටස 4) ඕන.

## 2. Railway එකේ host කරන්න

> ⚠️ **මුලින්ම approval ගන්න.** මේ mock එකේ Intellect/Sampath API contract එකේ field names සහ paths තියෙනවා. Bank එක security ගැන දැඩි නිසා public cloud එකක host කරන්න කලින් LinearSix / bank approval ගන්න.
> - GitHub repo එක **private** තියන්න.
> - Railway variables වලට **ඇත්ත Sampath credentials දාන්න එපා**, mock credentials විතරයි.
> - Approval නැත්නම් කොටස 4 (lab LAN එකේ HTTPS) පාවිච්චි කරන්න. ඒක APIM එකට වඩාත් ළඟයි.

1. මේ folder එක private GitHub repo එකකට push කරන්න.
2. Railway → New Project → Deploy from GitHub repo → ඒ repo එක තෝරන්න. Node එක auto detect වෙනවා, start command එක `node server.js` (`railway.json`).
3. Service එකේ **Variables** වලට මේවා දාන්න:

   | Variable | Value | තේරුම |
   |---|---|---|
   | `MOCK_CLIENT_ID` | ඔයා තෝරන id එකක් | Finacle secret file එකේ `apim.client.id` |
   | `MOCK_CLIENT_SECRET` | දිගු random value එකක් | Finacle secret file එකේ `apim.client.secret` |
   | `MOCK_ADMIN_KEY` | වෙනම random value එකක් | Admin endpoints (reset, revoke, force reply) |
   | `MOCK_TOKEN_TTL_SEC` | `3600` (expiry test එකට `120`) | Token lifetime |
   | `MOCK_SLOW_SEC` | `120` (ඉක්මන් tests වලට `20`) | Timeout scenarios වල delay |
   | `MOCK_BULK_SAMPLE_SPELLING` | `true` | Bulk reply එකේ doc sample spelling එක (`realAccountCurrrency`) |

4. Settings → Networking → **Generate Domain**. Browser එකෙන් `https://<app>.up.railway.app/` open කරන්න. ✓ RUNNING page එක එන්න ඕන.
5. Railway plan limits (free/trial credits, request time limit, sleep) Railway site එකේ බලන්න:
   - Timeout tests කරද්දී app sleep වෙන්න දෙන්න එපා.
   - Railway එක දිගු request එකක් කපලා 502/504 එකක් දුන්නොත් Finacle එකත් ඒක timeout එකක් විදිහටම ගන්නවා.

## 3. Lab Finacle එක mock එකට යොමු කරන්න (redeploy නෑ)

**Truststore එකට Railway CA එක import කරන්න.** Certificate check එක හැමවිටම on නිසා මේක ඕන:
```bash
H=<app>.up.railway.app
echo | openssl s_client -connect $H:443 -servername $H -showcerts 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/{n++} n>=2' | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' > railway-ca.pem
keytool -importcert -noprompt -alias railway-ca -file railway-ca.pem -keystore /finapp/vam/conf/vam-truststore.jks
```
- `railway-ca.pem` එක leaf cert එක issue කරපු intermediate CA එක.
- Leaf cert එක import කරන්න එපා. ඒක මාස 2–3 න් renew වෙනවා.
- APIM cert එකත් එකම truststore එකේ තිබ්බට කමක් නෑ.

**Secret file එක** (`/finapp/vam/conf/va-outbound.properties`): `apim.client.id` / `apim.client.secret` = Railway එකේ `MOCK_CLIENT_ID` / `MOCK_CLIENT_SECRET`.

**Setvar.** Status page එකේ "Point Finacle here" table එකේ URLs copy කරන්න:
```sql
UPDATE custom.cust_setvar_maint SET variable_value = 'https://<app>.up.railway.app/oauth2/token'
 WHERE module_name = 'SLIPS' AND sub_module_name = 'ISLIPS' AND variable_name = 'VA_TOKEN_URL';
UPDATE custom.cust_setvar_maint SET variable_value = 'https://<app>.up.railway.app/apis/svcv3/accounts/validateAccDetails/1.0.0/vaValidate'
 WHERE module_name = 'SLIPS' AND sub_module_name = 'ISLIPS' AND variable_name = 'VA_SINGLE_VALIDATE_URL';
UPDATE custom.cust_setvar_maint SET variable_value = 'https://<app>.up.railway.app/apis/svcv3/accounts/validateAccDetails/1.0.0/vaValidate/bulk'
 WHERE module_name = 'SLIPS' AND sub_module_name = 'ISLIPS' AND variable_name = 'VA_BULK_VALIDATE_URL';
UPDATE custom.cust_setvar_maint SET variable_value = 'https://<app>.up.railway.app/apis/svcv3/accounts/validateAccDetails/1.0.0/vaValidate/ledger'
 WHERE module_name = 'SLIPS' AND sub_module_name = 'ISLIPS' AND variable_name = 'VA_TXN_POST_URL';
UPDATE custom.cust_setvar_maint SET variable_value = '-'
 WHERE module_name = 'SLIPS' AND sub_module_name = 'ISLIPS' AND variable_name = 'VA_TLS_EXPECTED_HOST';
COMMIT;
```
- **ඉක්මන් timeout tests:** Lab එකේ `VA_API_TIMEOUT_SEC = 10` සහ Railway එකේ `MOCK_SLOW_SEC = 20` දාන්න.
- **Lab test data:** `lab-test-data.sql` එක run කරන්න (islips rows 11, ledger rows 6). Date එක lab BOD date එකට මාරු කරන්න.
- **Java version:** Lab එක Java 8. Railway TLS (GCM) එකට ඒක ගැටලුවක් නෑ. Sampath එකේ Java 7 TLS test එක ඇත්ත APIM එකට එරෙහිවම වෙනම කරන්න ඕන.

## 4. Railway නැතුව: lab LAN එකේ HTTPS mode එක (APIM වගේම)

```bash
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 365 \
  -subj "/CN=vam-mock.lab" -addext "subjectAltName=DNS:vam-mock.lab"
MOCK_TLS_KEY=key.pem MOCK_TLS_CERT=cert.pem PORT=8243 MOCK_CLIENT_ID=... MOCK_CLIENT_SECRET=... MOCK_ADMIN_KEY=... npm start
keytool -importcert -noprompt -alias vam-mock -file cert.pem -keystore /finapp/vam/conf/vam-truststore.jks
```
- Self-signed cert එකක් එක්ක URL එකේ IP එක දාන්න පුළුවන්: `https://<lab-ip>:8243/...`. `VA_TLS_EXPECTED_HOST = vam-mock.lab`.
- Sampath APIM setup එකත් මේ විදිහටමයි. ඒ නිසා ඒ configuration එකම lab එකේ test වෙනවා.

## 5. Test VA numbers → TEST_PLAN

| TEST_PLAN | කරන්නේ | Mock data |
|---|---|---|
| I1 single valid | Single screen එකේ VA එක | `800000000001` |
| I2 single invalid | Closed VA / 8 නොවෙන number එකක් | `800000000008`, `700000000000` |
| I3 timeout ×3 | Single VA | `899999999901` (`MOCK_SLOW_SEC` > `VA_API_TIMEOUT_SEC`) |
| Rules 1–7 | Bulk (`lab-test-data.sql`) | `…0002` expired, `…0003` D, `…0004` USD, `…0005` credit N, `…0006` blank, `…0007` no real a/c, `…0008` closed, `…0009` not returned |
| I4 local + VAM | Bulk එක දෙපාරක් run කරන්න. දෙවෙනි පාර `…0001` repository එකෙන් | — |
| I5 1200 VAs | 8 න් පටන් ගන්න ඕනම numbers 1200 ක් | batches 500/500/200 |
| I6 partial failure | 1200 VA + `899999999901`. Keyset order එක නිසා ඒක අන්තිම batch එකේ | Batch 1–2 commit, 3 fail |
| Bulk rejected | Batch එකේ `899999999911` | Nothing updated |
| I7 token expiry | `MOCK_TOKEN_TTL_SEC = 120` | Token auto renew |
| I8 401 renew | Run එකක් යද්දී `revoke-tokens` (පහළ) | එක පාරක් renew වෙලා නැවත යවනවා |
| I9 late success | Ledger row VA `899999999922` | TIMEOUT → retry → ERRP000245 → `S` |
| Posted, bad reply | Ledger row VA `899999999927` | Retry → ERRP000245 → `S` |
| I17 replay | Ledger row VA `899999999921` → `F` → `reprocess_flg = 'Y'` → replay → SUBMIT | `S` |
| Always fails | Ledger row VA `899999999926` | `F` |
| Stop code 404 | Single/ledger `899999999906` | Run stops |
| Retryable 502 | `899999999907` | Attempt 2 OK |
| Leg field name | `VA_TXN_LEG_ACCT_FIELD = accountNumer` කළොත් | ERRPMSG0007 (setvar එක ආපහු දාන්න) |

## 6. Admin endpoints (`MOCK_ADMIN_KEY` ඕන)

```bash
K='X-Mock-Admin-Key: <MOCK_ADMIN_KEY>'; B=https://<app>.up.railway.app
curl -X POST -H "$K" $B/__mock/revoke-tokens                        # tokens ඔක්කොම අවලංගු කරනවා (401 renew test)
curl -X POST -H "$K" -H 'Content-Type: application/json' \
     -d '{"mode":"http503","count":3}' $B/__mock/next               # ඊළඟ calls 3 ට 503 (timeout, http502/503/504/500/404, badjson, tech998)
curl -X POST -H "$K" $B/__mock/reset                                # tokens, ledger duplicates, log ඔක්කොම clear කරනවා
curl -H "$K" $B/__mock/log                                          # අන්තිම calls JSON විදිහට
```

## 7. Mock එක check කරන දේවල්

- **Token:** Basic auth, `grant_type=client_credentials`. API calls වලට Bearer token එක ඕන. නැත්නම් doc එකේ `401 / 900901` reply එක එනවා.
- **Ledger:**
  - `transactionID` duplicate නම් → `ERRP000245`
  - Legs දෙකේ amount ගැලපෙන්නේ නැත්නම් → `ERRPMSG00013`
  - VA leg එකක් නැත්නම් → `ERRPMSG00012`
  - `accountNumber` field එක නැත්නම් → `ERRPMSG0007`
- **Contract warnings:** Reply එක වෙනස් කරන්නේ නෑ. Status page එකේ රතු පාටින් සහ `X-Mock-Warnings` header එකේ පෙන්නනවා:
  - `interfaceId` වැරදියි
  - `channelRefNumber` නෑ, අකුරු 35 ට වැඩියි, හෝ reuse කරලා
  - `RequestHeaderUUID` header එක නෑ
  - `bankEntityId` 003 නෙවෙයි
  - `batchID` නෑ
- **Mock-only codes:** `MOCK_…` වලින් පටන් ගන්න error codes mock එකේ විතරයි (උදා: bulk VA 500 ට වැඩි වීම). ඇත්ත VAM codes නෙවෙයි.

Data ඔක්කොම memory එකේ. Restart කළොත් හෝ `/__mock/reset` කළොත් හිස් වෙනවා.
