# Test checklist

Run it twice: once in mock mode (`VITE_API_BASE_URL=mock`), then against the real backend while it is still in dry run. In mock mode, turn **Writes enabled** on in the Mock API menu to see real saves, and off to see dry runs.

Before you start:

- [ ] Sign in with your ERP username and database KOL. The header shows the plant and your ERP user name.
- [ ] A username that does not exist is refused with “No active ERP user …”.
- [ ] With writes off, the striped **DRY RUN** banner is visible on every tab.

## 1. Allocated issue split across two batches

Picklist `IPIC03454_26_27`, item P02621 (Sheet), pending 2,958 Sheet. Real data: test A of the backend brief.

- [ ] **Against picklist**: type `IPIC03454`. The line shows Required 2,958 / Issued 0 / Pending 2,958 **Sheet**.
- [ ] Click the line. The summary shows picklist, client, job content, item, and Required / Issued / Pending, each with **Sheet**.
- [ ] The batch table shows stock, GRN no. and date, batch no., warehouse and bin, oldest GRN first.
- [ ] Click batch `60325_…_1.00`. Quantity prefills **2958** and is selected; the unit next to it reads **Sheet**.
- [ ] Type `1500`, press **Enter**. Line 1 appears; the running total reads 1,500 of 2,958 Sheet, left 1,458.
- [ ] Click batch `61902_…_2.00`. Quantity prefills **1458**. Press **Add**. Total 2,958, left 0, shown in green.
- [ ] Try `0`, `-5`, `abc` in the quantity: letters and minus cannot be typed, zero is refused with a message.
- [ ] Press Save without a floor warehouse: "Choose the floor warehouse and bin."
- [ ] Choose **Floor-Panchla / Paper**. Voucher date defaults to today and cannot be set later than today.
- [ ] Switch to another app and back: batch stock reloads (the "In this issue" column still shows 1,500 and 1,458).
- [ ] Press **Save**. The confirmation lists both lines with Sheet and the total.
- [ ] Writes off: the button reads **Confirm (dry run)**. Confirm. The result says "Dry run — nothing was saved", shows **no voucher number**, and under "Rows the server would have written" shows two lines with PicklistTransactionID, MachineID, DepartmentID and ProcessID filled, and IDs masked as "(rolled back)".
- [ ] Writes on: confirm. A large voucher number appears (mock: `IS17255_26_27`) with **New issue**.
- [ ] Double-click Confirm: still one voucher (History shows it once).
- [ ] **New issue** returns to the list. The line's Issued is now 2,958 and it has left the default view; **Include fully issued lines** brings it back with Pending 0.

## 2. Direct issue of a substitute with an over-issue warning

Job content `J06482_26_27[1_1]`, planned R01312 at 68.84 Kg; the storekeeper issues R01175 instead (same spec, different mill). Real data: test B.

- [ ] **Direct issue**: type `J06482`. Pick `J06482_26_27[1_1]`.
- [ ] Planned items show R01312 Required 68.84 / Issued 0 / Pending 68.84 **Kg**.
- [ ] Department is preselected (mock: PRINTING, marked "suggested") and can be changed.
- [ ] The item table lists R01312 first, marked **planned**. Search `R01175`: it appears marked **substitute**, with job pending 68.84 Kg.
- [ ] Select R01175, click batch `52873_…_1.00`. Quantity prefills **68.84**; the unit reads **Kg**.
- [ ] Type `152`, press Enter. The running total turns amber: "Over by 83.16 Kg".
- [ ] Leave Slip No. blank. Choose Floor-Panchla / Paper.
- [ ] Mock only: Mock API → **Expire session**, then press Save. A sign-in dialog opens over the form, with your username filled in. Sign in. The form is unchanged (line, slip, warehouse). Press Save again.
- [ ] Press Save, then Confirm. The dialog switches to **Check the warnings** and lists OVER JOB PENDING: "Total 152 Kg is more than the job's pending requirement of 68.84 Kg."
- [ ] **Issue anyway** is disabled until the tick-box is ticked.
- [ ] Tick, press **Issue anyway**. Writes on: a voucher number appears (mock: `IS17256_26_27`). Writes off: the dry-run result, no number. In its rows, the header has JobBookingID **0** and DeliveryNoteNo shows “(rolled back)”, because a blank slip takes the voucher number; the line has the job's JobBookingID and PicklistTransactionID, MachineID, DepartmentID, ProcessID all 0.
- [ ] Mock only: Mock API → **Fail the stock refresh on the next save**, make another small direct issue. The result says the issue is saved but the stock summary was not updated, and **Retry stock refresh** succeeds.

## 3. History and delete

- [ ] **History** lists today's issues with voucher, type, job content, department, slip, total with unit, and who created them. Issues saved by this tool carry a **tool** badge.
- [ ] Expand an issue: its lines show item, batch, from-bin, floor bin, picklist and quantity with unit.
- [ ] Type a voucher number (or item code, job, user) in **Find an issue**: only matching issues stay.
- [ ] Each issue has a red **Delete** button next to its voucher number. **Delete** asks for confirmation. Writes off: "Dry run … unchanged", and the issue stays listed. Writes on: "… is deleted" and it leaves the list; in mock mode the batch stock comes back.
- [ ] An issue whose material has been consumed shows a grey "Consumed" chip instead of Delete (hover it for the reason).

## 4. Against the real backend (dry run)

- [ ] `GET /session` reports `writesEnabled: false`: the banner shows, confirm reads "Confirm (dry run)".
- [ ] Flows 1 and 2 above end in the dry-run result, and the would-be rows match the backend's acceptance test expectations.
- [ ] History shows your ERP user name as the creator of what you posted.
