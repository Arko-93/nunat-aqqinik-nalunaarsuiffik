# Decision Geography build targets
# Prerequisites: python3, .venv with jsonschema

SHELL := /bin/bash
SOURCE_DIR := source
SCRIPTS_DIR := scripts
DIST_DIR := dist

# Auto-detect .venv
VENV_PYTHON := python3
ifneq ($(wildcard .venv/bin/python3),)
	VENV_PYTHON := .venv/bin/python3
else ifneq ($(wildcard ../.venv/bin/python3),)
	VENV_PYTHON := ../.venv/bin/python3
else ifneq ($(wildcard ../../.venv/bin/python3),)
	VENV_PYTHON := ../../.venv/bin/python3
endif
PYTHON := $(VENV_PYTHON)

SOURCE_NDJSON := $(SOURCE_DIR)/places.ndjson \
                 $(SOURCE_DIR)/place-classifications.ndjson \
                 $(SOURCE_DIR)/place-names.ndjson \
                 $(SOURCE_DIR)/place-geometries.ndjson \
                 $(SOURCE_DIR)/administrative-areas.ndjson \
                 $(SOURCE_DIR)/administrative-memberships.ndjson \
                 $(SOURCE_DIR)/external-identifiers.ndjson \
                 $(SOURCE_DIR)/connections.ndjson \
                 $(SOURCE_DIR)/connection-services.ndjson \
                 $(SOURCE_DIR)/sources.ndjson

NUNAGIS_AUTHORITY := reconciliation/authority/oqaasileriffik-nunagis.ndjson
RELEASE_ID ?= 2026.08.07.4

.PHONY: all validate test publish-check reconcile fetch-nunagis fetch-nunagis-localities normalize-nunagis build clean release register-snapshot

all: validate build

# --- Validation gates ---

validate:
	$(PYTHON) $(SCRIPTS_DIR)/validate.py --mode validate --source-dir $(SOURCE_DIR)

test:
	$(PYTHON) $(SCRIPTS_DIR)/validate.py --mode test --source-dir $(SOURCE_DIR)
	$(PYTHON) $(SCRIPTS_DIR)/test_reconciliation.py
	$(PYTHON) $(SCRIPTS_DIR)/test_import_nunagis_localities.py
	$(PYTHON) $(SCRIPTS_DIR)/test_build.py
	$(PYTHON) $(SCRIPTS_DIR)/test_schema_meta.py
	$(PYTHON) $(SCRIPTS_DIR)/test_release.py
	$(PYTHON) $(SCRIPTS_DIR)/test_land_peaks.py

publish-check:
	$(PYTHON) $(SCRIPTS_DIR)/validate.py --mode publish-check --source-dir $(SOURCE_DIR)
	$(PYTHON) $(SCRIPTS_DIR)/test_reconciliation.py
	$(PYTHON) $(SCRIPTS_DIR)/test_import_nunagis_localities.py
	$(PYTHON) $(SCRIPTS_DIR)/test_build.py
	$(PYTHON) $(SCRIPTS_DIR)/test_schema_meta.py
	$(PYTHON) $(SCRIPTS_DIR)/test_release.py
	$(PYTHON) $(SCRIPTS_DIR)/test_land_peaks.py

fetch-nunagis:
	$(PYTHON) $(SCRIPTS_DIR)/fetch_nunagis_placenames.py

fetch-nunagis-localities:
	$(PYTHON) $(SCRIPTS_DIR)/fetch_nunagis_placenames.py --localities

normalize-nunagis:
	$(PYTHON) $(SCRIPTS_DIR)/normalize_nunagis_placenames.py

reconcile:
	@authority_args=""; \
	if [ -f "$(NUNAGIS_AUTHORITY)" ]; then \
		authority_args="--authority $(NUNAGIS_AUTHORITY)"; \
	fi; \
	$(PYTHON) $(SCRIPTS_DIR)/reconcile_places.py $$authority_args

register-snapshot:
	$(PYTHON) $(SCRIPTS_DIR)/register_snapshot.py

release: build register-snapshot
	@if [ -d "releases/$(RELEASE_ID)" ]; then \
		echo "Release releases/$(RELEASE_ID) already exists; skipping build_release"; \
	else \
		$(PYTHON) $(SCRIPTS_DIR)/build_release.py --release-id $(RELEASE_ID); \
	fi

# --- Build distributions ---

build: $(DIST_DIR)
	$(PYTHON) $(SCRIPTS_DIR)/build.py
	$(PYTHON) $(SCRIPTS_DIR)/ndjson2db.py

$(DIST_DIR):
	mkdir -p $(DIST_DIR)

clean:
	rm -rf $(DIST_DIR)
