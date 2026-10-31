# Shell config
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Make config
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# Platform
UNAME_S := $(shell uname -s)
NOT_INSTALLED := $(shell printf '\033[31mnot installed\033[0m')

# Executables
MAKE_VERSION := $(shell make --version | head -n 1 2> /dev/null)
SED := $(shell command -v sed 2> /dev/null)
SED_INPLACE := $(shell if $(SED) --version >/dev/null 2>&1; then echo "$(SED) -i"; else echo "$(SED) -i ''"; fi)
AWK := $(shell command -v awk 2> /dev/null)
GIT := $(shell command -v git 2> /dev/null)
GIT_VERSION := $(shell $(GIT) --version 2> /dev/null || printf '\033[31mnot installed\033[0m')
NPM := $(shell command -v npm 2> /dev/null)
NPM_VERSION := $(shell npm --version 2> /dev/null || printf '\033[31mnot installed\033[0m')
XCRUN := $(shell command -v xcrun 2> /dev/null)
XCRUN_VERSION := $(if $(XCRUN),$(shell $(XCRUN) --version 2> /dev/null),$(NOT_INSTALLED))
XCODEBUILD := $(shell command -v xcodebuild 2> /dev/null)

# web-ext version used by test/lint (run through npx)
WEB_EXT_VERSION := 8.10.0

# Browsers used by the run targets. Each *_BIN can be overridden on the
# command line, e.g. make run/chrome CHROME_BIN=/path/to/chromium
# Chrome: branded Google Chrome ignores --load-extension since version 137,
# so Chrome for Testing and Chromium are preferred when installed.
SAFARI_APP := Safari.app
# macOS folder searched for the browser apps (e.g. APPS_DIR=~/Applications)
APPS_DIR ?= /Applications
ifeq ($(UNAME_S),Darwin)
# Prints the first executable found among the given paths (which may contain spaces)
find_path = $(shell for p in $(1); do if [ -x "$$p" ]; then echo "$$p"; break; fi; done)
ifndef CHROME_BIN
CHROME_BIN := $(call find_path,"$(APPS_DIR)/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" "$(APPS_DIR)/Chromium.app/Contents/MacOS/Chromium" "$(APPS_DIR)/Google Chrome.app/Contents/MacOS/Google Chrome")
endif
ifndef EDGE_BIN
EDGE_BIN := $(call find_path,"$(APPS_DIR)/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")
endif
ifndef FIREFOX_BIN
FIREFOX_BIN := $(call find_path,"$(APPS_DIR)/Firefox Developer Edition.app/Contents/MacOS/firefox" "$(APPS_DIR)/Firefox.app/Contents/MacOS/firefox")
endif
else
find_cmd = $(firstword $(foreach c,$(1),$(shell command -v $(c) 2> /dev/null)))
ifndef CHROME_BIN
CHROME_BIN := $(call find_cmd,chromium chromium-browser google-chrome google-chrome-stable)
endif
ifndef EDGE_BIN
EDGE_BIN := $(call find_cmd,microsoft-edge microsoft-edge-stable)
endif
ifndef FIREFOX_BIN
FIREFOX_BIN := $(call find_cmd,firefox-developer-edition firefox firefox-esr)
endif
endif
# Extra flags appended to every browser launched by the run targets
BROWSER_ARGS ?=

# Project variables
MANIFEST := manifest.json
APP_NAME := $(shell jq -r .name $(MANIFEST) | tr -d '[:space:]' | tr -d '"')
APP_DESCRIPTION := $(shell jq -r .description $(MANIFEST))
APP_VERSION := $(shell jq -r .version $(MANIFEST))
APP_LICENSE := $(shell head -n 1 LICENSE)
PROJECT_REPO ?= $(shell url=$$($(GIT) config --get remote.origin.url); echo $${url%.git})
GITHUB_USER_NAME ?= $(shell echo $(PROJECT_REPO) | $(AWK) -F/ 'NF>=4{print $$4}')
GITHUB_USER_EMAIL ?= $(shell $(GIT) config --get user.email || echo '')
DEFAULT_URL ?= "https://scholar.google.com"
SAFARI_DEV_ID := dev.fcalefato.$(APP_NAME)

# Dirs
WORK_DIR := $(CURDIR)
BUILD_DIR := $(WORK_DIR)/build
SAFARI_DIR := safari
CHROME_DIR := chrome
FIREFOX_DIR := firefox
FIREFOX_SRC_DIR = $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APP_NAME)-addon-$(APP_VERSION)
SAFARI_SRC_DIR = $(BUILD_DIR)/$(SAFARI_DIR)/src
# Throwaway browser profiles for the run targets, so they work even while
# the user's own browser is open
PROFILES_DIR = $(BUILD_DIR)/profiles
CSS := css
JS := js
IMAGES := images
HTML := html

# Files
SRC := $(CSS) $(JS) $(IMAGES) $(HTML) $(MANIFEST)
SRC_FILES := $(shell find $(SRC) -type f)

# Package the extension sources into the archive given as $(1). The same
# manifest.json serves every browser, so Chrome, Edge, and Firefox packages
# share this step.
zip_sources = zip -r -FS $(1) $(SRC) -x \*.DS_Store

# Stamp files
CHROME_BUILD_TIMESTAMP := .chrome.stamp
FIREFOX_BUILD_TIMESTAMP := .firefox.stamp
SAFARI_BUILD_TIMESTAMP := .safari.stamp
RELEASE_STAMP := .release.stamp
STAMP_FILES := $(wildcard .*.stamp)

# Colors
RESET := \033[0m
RED := \033[0;31m
GREEN := \033[0;32m
ORANGE := \033[0;33m
MAGENTA := \033[0;35m
CYAN := \033[0;36m

#-- Info

.DEFAULT_GOAL := help
.PHONY: help
help:  ## Show this help message
	@echo -e "\n$(MAGENTA)$(APP_NAME) v$(APP_VERSION) Makefile$(RESET)"
	@echo -e "\n$(MAGENTA)Usage:\n$(RESET) make $(CYAN)[target]$(RESET)\n"
	@grep -E '^[0-9a-zA-Z_-]+(/?[0-9a-zA-Z_-]*)*:.*?## .*$$|(^#--)' $(MAKEFILE_LIST) \
	| $(AWK) 'BEGIN {FS = ":.*?## "}; {printf "\033[36m %-15s\033[0m %s\n", $$1, $$2}' \
	| $(SED) -e 's/\[36m #-- /\[35m/'

.PHONY: info
info:  ## Show development environment info
	@echo -e "$(MAGENTA)\nSystem:$(RESET)"
	@echo -e "  $(CYAN)OS:$(RESET) $(shell uname -s)"
	@echo -e "  $(CYAN)Shell:$(RESET) $(SHELL) - $(shell $(SHELL) --version | head -n 1)"
	@echo -e "  $(CYAN)Make:$(RESET) $(MAKE_VERSION)"
	@echo -e "  $(CYAN)Git:$(RESET) $(GIT_VERSION)"
	@echo -e "  $(CYAN)npm:$(RESET) $(NPM_VERSION)"
	@echo -e "  $(CYAN)xcrun:$(RESET) $(XCRUN_VERSION)"
	@echo -e "  $(CYAN)xcodebuild:$(RESET) $(or $(XCODEBUILD),$(NOT_INSTALLED))"
	@echo -e "$(MAGENTA)Browsers:$(RESET)"
	@echo -e "  $(CYAN)Chrome:$(RESET) $(or $(CHROME_BIN),$(NOT_INSTALLED))"
	@echo -e "  $(CYAN)Edge:$(RESET) $(or $(EDGE_BIN),$(NOT_INSTALLED))"
	@echo -e "  $(CYAN)Firefox:$(RESET) $(or $(FIREFOX_BIN),$(NOT_INSTALLED))"
	@echo -e "$(MAGENTA)Project:$(RESET)"
	@echo -e "  $(CYAN)Project name:$(RESET) $(APP_NAME)"
	@echo -e "  $(CYAN)Project description:$(RESET) $(APP_DESCRIPTION)"
	@echo -e "  $(CYAN)Project version:$(RESET) $(APP_VERSION)"
	@echo -e "  $(CYAN)Project license:$(RESET) $(APP_LICENSE)"
	@echo -e "$(MAGENTA)Git:$(RESET)"
	@echo -e "  $(CYAN)Project author:$(RESET) $(GITHUB_USER_NAME) <$(GITHUB_USER_EMAIL)>"
	@echo -e "  $(CYAN)Project directory:$(RESET) $(CURDIR)"
	@echo -e "  $(CYAN)Project repository:$(RESET) $(PROJECT_REPO)"

# Dependencies

.PHONY: dep/git
dep/git:
	@if [ -z "$(GIT)" ]; then echo -e "$(RED)Git not found.$(RESET)" && exit 1; fi

.PHONY: dep/macos
dep/macos:
	@if [ "$(UNAME_S)" != "Darwin" ]; then echo -e "$(RED)This target needs macOS (found $(UNAME_S)).$(RESET)"; exit 1; fi

.PHONY: dep/xcode
dep/xcode: | dep/macos
	@if [ -z "$(XCRUN)" ] || [ -z "$(XCODEBUILD)" ]; then echo -e "$(RED)Xcode is not installed (xcrun and xcodebuild are needed).$(RESET)"; exit 1; fi

.PHONY: dep/npx
dep/npx:
	@command -v npx > /dev/null || { echo -e "$(RED)npx not found: install Node.js.$(RESET)"; exit 1; }

# Fails with a hint when the browser executable given as $(2) is missing
define check_browser
	@if [ -z "$(2)" ] || [ ! -x "$(2)" ]; then \
		echo -e "$(RED)$(1) not found. Install it or pass $(3)=/path/to/executable.$(RESET)"; \
		exit 1; \
	fi
endef

.PHONY: dep/chrome
dep/chrome:
	$(call check_browser,Chrome or Chromium,$(CHROME_BIN),CHROME_BIN)

.PHONY: dep/firefox
dep/firefox: | dep/npx
	$(call check_browser,Firefox,$(FIREFOX_BIN),FIREFOX_BIN)

.PHONY: dep/edge
dep/edge:
	$(call check_browser,Microsoft Edge,$(EDGE_BIN),EDGE_BIN)

.PHONY: dep/safari
dep/safari: | dep/macos
	@[ -d "/Applications/$(SAFARI_APP)" ] || [ -d "$(APPS_DIR)/$(SAFARI_APP)" ] || { echo -e "$(RED)Safari is not installed.$(RESET)"; exit 1; }

#-- Test

# npm ci installs exactly what package-lock.json lists, without rewriting it
node_modules: package.json package-lock.json
	@echo -e "$(CYAN)Installing dependencies...$(RESET)"
	@npm ci

.PHONY: test
test: node_modules  ## Run unit tests
	@echo -e "$(CYAN)\nRunning unit tests...$(RESET)"
	@npx vitest run
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: test/lint
test/lint: build/firefox | dep/npx  ## Lint the Firefox addon with web-ext (fails on errors)
	@echo -e "$(CYAN)\nLinting Firefox addon...$(RESET)"
	@npx --yes web-ext@$(WEB_EXT_VERSION) lint --source-dir $(FIREFOX_SRC_DIR)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: test/watch
test/watch: node_modules  ## Run unit tests in watch mode
	@npx vitest

.PHONY: test/live
test/live: node_modules  ## Run live tests against the dblp API (needs network)
	@echo -e "$(CYAN)\nRunning live tests against dblp.org...$(RESET)"
	@npm run --silent test:live
	@echo -e "$(GREEN)Done.$(RESET)"

#-- Build targets

.PHONY: build
build: build/all  ## Build all extensions (alias: build/all)

.PHONY: build/firefox
build/firefox: $(FIREFOX_BUILD_TIMESTAMP)  ## Build Firefox addon XPI
$(FIREFOX_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo -e "$(CYAN)\nBuilding Firefox addon...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(FIREFOX_DIR) > /dev/null
	@$(call zip_sources,$(BUILD_DIR)/$(FIREFOX_DIR)/$(APP_NAME)-addon-$(APP_VERSION).xpi)
	@# Recreate the unpacked copy so files removed from the sources do not linger
	@rm -rf $(FIREFOX_SRC_DIR)
	@mkdir -p $(FIREFOX_SRC_DIR)
	@cp -r $(SRC) $(FIREFOX_SRC_DIR)
	@touch $(FIREFOX_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: build/safari
build/safari: $(SAFARI_BUILD_TIMESTAMP)  ## Build Safari app-extension (macOS with Xcode only)
$(SAFARI_BUILD_TIMESTAMP): $(SRC_FILES) | dep/xcode
	@echo -e "$(CYAN)\nBuilding Safari app extension...$(RESET)"
	@# Recreate the sources copy so files removed from the sources do not linger
	@rm -rf $(SAFARI_SRC_DIR)
	@mkdir -p $(SAFARI_SRC_DIR)
	@cp -r $(SRC) $(SAFARI_SRC_DIR)
	@$(XCRUN) safari-web-extension-converter $(SAFARI_SRC_DIR) --app-name "$(APP_NAME)" --bundle-identifier "$(SAFARI_DEV_ID)" --project-location $(BUILD_DIR)/$(SAFARI_DIR) --no-prompt --no-open --force --macos-only
	@cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME) && $(XCODEBUILD) -quiet -target $(APP_NAME) -configuration Release clean build
	@# zip needs -r to include the app bundle's contents, and runs from the
	@# Release folder so the archive holds $(APP_NAME).app at its root
	@cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME)/build/Release && zip -r -FS $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME)-appex-$(APP_VERSION).zip $(APP_NAME).app
	@touch $(SAFARI_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: build/chrome
build/chrome: $(CHROME_BUILD_TIMESTAMP)  ## Build Chrome extension zip
$(CHROME_BUILD_TIMESTAMP): $(SRC_FILES)
	@echo -e "$(CYAN)\nBuilding Chrome extension...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(CHROME_DIR) > /dev/null
	@$(call zip_sources,$(BUILD_DIR)/$(CHROME_DIR)/$(APP_NAME)-ext-$(APP_VERSION).zip)
	@touch $(CHROME_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done$(RESET)"

.PHONY: build/edge
build/edge: build/chrome  ## Build Edge extension zip (same as Chrome)

# Safari needs macOS and Xcode, so build/all skips it elsewhere
BUILD_ALL := build/chrome build/firefox
ifeq ($(UNAME_S),Darwin)
BUILD_ALL += build/safari
endif

.PHONY: build/all
build/all: $(BUILD_ALL)  ## Build all extensions (Safari only on macOS) (alias: build)
ifneq ($(UNAME_S),Darwin)
	@echo -e "$(ORANGE)\nSkipped Safari: it can only be built on macOS with Xcode.$(RESET)"
endif
	@echo -e "$(CYAN)\nAll extensions built.$(RESET)"

.PHONY: build/clean
build/clean:  ## Clean up build directory and remove all timestamps
	@echo -e "$(CYAN)\nCleaning up $(BUILD_DIR) directory...$(RESET)"
	@rm -rf $(BUILD_DIR)/$(FIREFOX_DIR)
	@rm -rf $(BUILD_DIR)/$(SAFARI_DIR)
	@rm -rf $(BUILD_DIR)/$(CHROME_DIR)
	@rm -rf $(PROFILES_DIR)
	@rm -f $(STAMP_FILES)
	@echo -e "$(GREEN)Done.$(RESET)"

#-- Release

define update_version
    echo -e "$(CYAN)\nBump version from $(APP_VERSION) to $(1)$(RESET)" && \
    $(SED_INPLACE) -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(1)\"/" $(MANIFEST) package.json && \
    echo -e "$(GREEN)Version updated.$(RESET)"
endef

.PHONY: bump/patch
bump/patch: | release/check  ## Bump patch version (e.g., 1.0.0 -> 1.0.1)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$NF = $$NF + 1; print $$0}') ; \
		$(call update_version,$$NEW_VERSION) ; \
	fi

.PHONY: bump/minor
bump/minor: | release/check  ## Bump minor version (e.g., 1.0.0 -> 1.1.0)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$(NF-1)++; $$NF=0; print $$0}') ; \
		$(call update_version,$$NEW_VERSION) ; \
	fi

.PHONY: bump/major
bump/major: | release/check  ## Bump major version (e.g., 1.0.0 -> 2.0.0)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$1++; $$2=0; $$3=0; print $$0}') ; \
		$(call update_version,$$NEW_VERSION) ; \
	fi

.PHONY: tag/apply
tag/apply: | dep/git  ## Create local tag from manifest version
	@$(eval TAG := v$(APP_VERSION))
	@if $(GIT) rev-parse $(TAG) >/dev/null 2>&1; then \
		echo -e "$(ORANGE)\nTag $(TAG) already exists.$(RESET)"; \
	else \
		echo -e "$(CYAN)\nCreating tag $(TAG)...$(RESET)"; \
		$(GIT) tag $(TAG); \
		echo -e "$(GREEN)Done. Tag $(TAG) created.$(RESET)"; \
	fi

.PHONY: tag/push
tag/push: | dep/git tag/apply  ## Push local tag to origin (triggers release action)
	@$(eval TAG := v$(APP_VERSION))
	@if [ -n "$$($(GIT) ls-remote --tags origin "refs/tags/$(TAG)")" ]; then \
		echo -e "$(ORANGE)\nNothing to push: tag $(TAG) already exists on origin.$(RESET)"; \
	else \
		echo -e "$(CYAN)\nPushing pending commits to origin...$(RESET)" ; \
		$(GIT) push origin main ; \
		echo -e "$(CYAN)\nPushing tag $(TAG) to origin...$(RESET)" ; \
		$(GIT) push origin $(TAG) ; \
		echo -e "$(GREEN)Done.$(RESET)" ; \
	fi

.PHONY: tag/delete
tag/delete: | dep/git  ## Delete the tag for the current version
	@$(eval TAG := v$(APP_VERSION))
	@if $(GIT) rev-parse $(TAG) >/dev/null 2>&1; then \
		echo -e "$(CYAN)\nDeleting tag $(TAG)...$(RESET)"; \
		$(GIT) tag -d $(TAG) && $(GIT) push origin :refs/tags/$(TAG); \
		echo -e "$(GREEN)Done.$(RESET)" ; \
	else \
		echo -e "$(ORANGE)Tag $(TAG) does not exist.$(RESET)"; \
	fi

.PHONY: release/check
release/check: | dep/git  ## Check if a new release is needed
	@TAG=$$($(GIT) describe --tags --abbrev=0 2> /dev/null || true); \
	if [ -z "$$TAG" ]; then \
		echo -e "$(ORANGE)\nNo tags found: a release is needed.$(RESET)"; \
		echo "true" > $(RELEASE_STAMP); \
		exit 0; \
	fi; \
	BEHIND_AHEAD=$$($(GIT) rev-list --left-right --count $$TAG...HEAD); \
	REMOTE_TAGS=$$($(GIT) ls-remote --tags origin | $(AWK) '{print $$2}'); \
	if echo "$$REMOTE_TAGS" | grep -q "refs/tags/$$TAG$$"; then TAG_ON_REMOTE="true"; else TAG_ON_REMOTE="false"; fi; \
	if [ "$$BEHIND_AHEAD" != "0	0" ] || [ "$$TAG_ON_REMOTE" = "false" ]; then echo "true" > $(RELEASE_STAMP); else echo "false" > $(RELEASE_STAMP); fi; \
	echo -e "$(CYAN)\nChecking if a new release is needed...$(RESET)"; \
	echo -e "  $(CYAN)Current tag:$(RESET) $$TAG"; \
	if [ "$$TAG_ON_REMOTE" = "true" ]; then \
		echo -e "  $(CYAN)Tag on origin:$(RESET) $(GREEN)true$(RESET)"; \
	else \
		echo -e "  $(CYAN)Tag on origin:$(RESET) $(RED)false$(RESET)"; \
	fi; \
	echo -e "  $(CYAN)Commits behind/ahead:$(RESET) $$(echo $$BEHIND_AHEAD | $(AWK) '{behind=$$1; ahead=$$2; bc=(behind>0 ? "$(RED)" : "$(RESET)"); ac=(ahead>0 ? "$(GREEN)" : "$(RESET)"); print bc "↓" behind "$(RESET)/" ac "↑" ahead "$(RESET)"}')"; \
	NEEDS=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS" = "true" ]; then \
		echo -e "  $(CYAN)Needs release:$(RESET) $(GREEN)$$NEEDS$(RESET)"; \
	else \
		echo -e "  $(CYAN)Needs release:$(RESET) $(ORANGE)$$NEEDS$(RESET)"; \
	fi

.PHONY: release
release: tag/push  ## Triggers the release action - pushes the tag to origin (alias: tag/push)

#-- Run

# Chromium flags shared by run/chrome and run/edge; the extension is loaded
# straight from the working tree, so a reload picks up source changes
CHROMIUM_RUN_FLAGS := \
	--force-dev-mode-highlighting \
	--no-first-run \
	--no-default-browser-check \
	--disable-sync \
	--disable-default-apps \
	--disable-client-side-phishing-detection \
	--disable-background-networking \
	--disable-background-timer-throttling \
	--disable-backgrounding-occluded-windows \
	--disable-breakpad \
	--disable-dev-shm-usage \
	--disable-renderer-backgrounding \
	--metrics-recording-only \
	--load-extension=$(WORK_DIR)

.PHONY: run/chrome
run/chrome: | dep/chrome  ## Run Chrome extension in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Chrome extension with $(CHROME_BIN)...$(RESET)"
	@if "$(CHROME_BIN)" --version 2> /dev/null | grep -q '^Google Chrome [0-9]'; then \
		echo -e "$(ORANGE)Branded Google Chrome ignores --load-extension since version 137: install Chrome for Testing or Chromium, or load $(WORK_DIR) from chrome://extensions > Load unpacked.$(RESET)"; \
	fi
	@mkdir -p $(PROFILES_DIR)/chrome
	@"$(CHROME_BIN)" --user-data-dir=$(PROFILES_DIR)/chrome \
		--auto-open-devtools-for-tabs \
		$(CHROMIUM_RUN_FLAGS) $(BROWSER_ARGS) \
		$(DEFAULT_URL)

.PHONY: run/edge
run/edge: | dep/edge   ## Run Edge extension (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Edge extension with $(EDGE_BIN)...$(RESET)"
	@mkdir -p $(PROFILES_DIR)/edge
	@"$(EDGE_BIN)" --user-data-dir=$(PROFILES_DIR)/edge \
		$(CHROMIUM_RUN_FLAGS) $(BROWSER_ARGS) \
		$(DEFAULT_URL)

.PHONY: run/firefox
run/firefox: build/firefox | dep/firefox  ## Run Firefox addon in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Firefox addon with $(FIREFOX_BIN)...$(RESET)"
	@npx --yes web-ext@$(WEB_EXT_VERSION) run --firefox="$(FIREFOX_BIN)" \
		--source-dir=$(FIREFOX_SRC_DIR) \
		--start-url=$(DEFAULT_URL) \
		$(if $(BROWSER_ARGS),$(foreach a,$(BROWSER_ARGS),--arg=$(a)))

.PHONY: run/safari
run/safari: build/safari | dep/safari  ## Run Safari app-extension (macOS only)
	@echo -e "$(CYAN)\nRunning Safari app-extension...$(RESET)"
	@echo -e "${ORANGE}Note that the extension is not signed, you need to go to 'Settings' > Select 'Developer' tab > Check the 'Allow unsigned extensions' box.${RESET}"
	@open -a $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME)/build/Release/$(APP_NAME).app
