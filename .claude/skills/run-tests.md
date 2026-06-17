---
name: run-tests
description: Run IRIS backend tests — unit, integration, or e2e. Covers flow engine, budget service, assets, committee workflow, and full PR lifecycle.
---

Run the appropriate test suite for the IRIS backend.

## Steps

1. Check if Docker containers are running:
   ```bash
   docker ps --filter name=nitinventory-backend --format "{{.Status}}"
   ```
   If not running, start them: `docker compose up -d`

2. Determine which tests to run based on what was changed:
   - `flow_engine.py` or `purchase_requests.py` → `tests/test_flow_engine.py`
   - `budget_service.py` or budget models → `tests/test_budget_service.py`
   - `asset_service.py` → `tests/test_asset_service.py`
   - Tech committee logic → `tests/test_committee_workflow.py`
   - PR cancellation/PO → `tests/test_cancellation.py`
   - Bill passing / single bid → `tests/test_bill_passing_and_single_bid.py`
   - Full lifecycle → `python3 -m app.e2e_test`

3. Run the relevant test(s):
   ```bash
   # All tests
   docker exec nitinventory-backend pytest -v

   # Specific file
   docker exec nitinventory-backend pytest tests/<filename>.py -v

   # Specific test
   docker exec nitinventory-backend pytest tests/<filename>.py::<test_name> -v

   # E2E full workflow
   docker exec nitinventory-backend python3 -m app.e2e_test
   ```

4. If tests fail:
   - Check for schema changes not reflected in models (restart backend to re-run `seed.py`)
   - Confirm the test database `nitinventory_test` exists and is accessible
   - Check `backend/tests/conftest.py` for session fixture issues

5. Report: summarize which tests passed/failed, and for failures show the exact assertion and traceback.
