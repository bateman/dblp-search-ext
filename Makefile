# Shell config
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

# Make config
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

# Executables
MAKE_VERSION := $(shell make --version | head -n 1 2> /dev/null)
SED := $(shell command -v sed 2> /dev/null)
SED_INPLACE := $(shell if $(SED) --version >/dev/null 2>&1; then echo "$(SED) -i"; else echo "$(SED) -i ''"; fi)
AWK := $(shell command -v awk 2> /dev/null)
GIT := $(shell command -v git 2> /dev/null)
GIT_VERSION := $(shell $(GIT) --version 2> /dev/null || printf '\033[31mnot installed\033[0m')
XCRUN := $(shell command -v xcrun 2> /dev/null)
XCRUN_VERSION := $(shell $(XCRUN) --version 2> /dev/null || printf '\033[31mnot installed\033[0m')
XCODEBUILD := $(shell command -v xcodebuild 2> /dev/null || printf '\033[31mnot installed\033[0m')

# Apps
CHROME_APP := Google Chrome.app
FIREFOX_APP := Firefox Developer Edition.app
EDGE_APP := Microsoft Edge.app
SAFARI_APP := Safari.app

# Project variables
MANIFEST := manifest.json
MANIFEST_FIREFOX := manifest.firefox.json
MANIFEST_TMP := manifest.json.tmp
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
CSS := css
JS := js
IMAGES := images
HTML := html

# Files
SRC := $(CSS) $(JS) $(IMAGES) $(HTML) $(MANIFEST)
SRC_FILES := $(shell find $(SRC) -type f)
JS_FILES := $(wildcard $(JS)/*.js)

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
	@echo -e "  $(CYAN)xcrun:$(RESET) $(XCRUN_VERSION)"
	@echo -e "  $(CYAN)xcodebuild:$(RESET) $(XCODEBUILD)"
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

.PHONY: dep/xcode
dep/xcode:
	@echo -e "$(CYAN)\nChecking if Xcode is installed...$(RESET)"
	@xcode-select -p || echo 'Xcode is not installed.'

.PHONY: dep/macos
dep/macos:
	@echo -e "$(CYAN)\nChecking if OS is MacOS...$(RESET)"
	@uname -s | grep "Darwin" || echo 'Run targets are only available on MacOS.'

.PHONY: dep/chrome
dep/chrome: | dep/macos
	@echo -e "$(CYAN)\nChecking if Google Chrome is installed...$(RESET)"
	@ls /Applications | grep -x "$(CHROME_APP)" || { echo -e "$(RED)Google Chrome is not installed.$(RESET)"; exit 1; }

.PHONY: dep/firefox
dep/firefox: | dep/macos
	@echo -e "$(CYAN)\nChecking if Firefox Developer Edition is installed...$(RESET)"
	@ls /Applications | grep -x "$(FIREFOX_APP)" || { echo -e "$(RED)Firefox Developer Edition is not installed.$(RESET)"; exit 1; }
	@echo -e "$(CYAN)\nChecking if web-ext is installed...$(RESET)"
	@web-ext --version || { echo -e "$(RED)web-ext is not installed.$(RESET)"; exit 1; }

.PHONY: dep/edge
dep/edge: | dep/macos
	@echo -e "$(CYAN)\nChecking if Microsoft Edge is installed...$(RESET)"
	@ls /Applications | grep -x "$(EDGE_APP)" || { echo -e "$(RED)Microsoft Edge is not installed.$(RESET)"; exit 1; }

.PHONY: dep/safari
dep/safari: | dep/macos
	@echo -e "$(CYAN)\nChecking if Safari is installed...$(RESET)"
	@ls /Applications | grep -x "$(SAFARI_APP)" || { echo -e "$(RED)Safari is not installed.$(RESET)"; exit 1; }

#-- Test

.PHONY: test
test:  ## Run unit tests
	@echo -e "$(CYAN)\nRunning unit tests...$(RESET)"
	@npx vitest run
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: test/watch
test/watch:  ## Run unit tests in watch mode
	@npx vitest

#-- Build targets

.PHONY: build
build: build/all  ## Build all extensions (alias: build/all)

.PHONY: build/firefox
build/firefox: $(FIREFOX_BUILD_TIMESTAMP)  ## Build Firefox addon XPI and sources
$(FIREFOX_BUILD_TIMESTAMP): $(SRC_FILES) $(MANIFEST_FIREFOX)
	@echo -e "$(CYAN)\nBuilding Firefox addon...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APP_NAME)-addon-$(APP_VERSION) > /dev/null
	@mv $(MANIFEST) $(MANIFEST_TMP)
	@mv $(MANIFEST_FIREFOX) $(MANIFEST)
	@zip -r -FS $(BUILD_DIR)/$(FIREFOX_DIR)/$(APP_NAME)-addon-$(APP_VERSION).xpi $(SRC) -x \*.DS_Store
	@zip -r -FS $(BUILD_DIR)/$(FIREFOX_DIR)/$(APP_NAME)-addon-$(APP_VERSION)-sources.zip $(JS_FILES)
	@cp -r $(SRC) $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APP_NAME)-addon-$(APP_VERSION)
	@cp $(MANIFEST) $(BUILD_DIR)/$(FIREFOX_DIR)/src/$(APP_NAME)-addon-$(APP_VERSION)
	@mv $(MANIFEST) $(MANIFEST_FIREFOX)
	@mv $(MANIFEST_TMP) $(MANIFEST)
	@touch $(FIREFOX_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: build/safari
build/safari: dep/macos $(SAFARI_BUILD_TIMESTAMP)  ## Build Safari app-extension
$(SAFARI_BUILD_TIMESTAMP): $(SRC_FILES) $(MANIFEST)
	@echo -e "$(CYAN)\nBuilding Safari app extension...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR) > /dev/null
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR)/build > /dev/null
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR)/src > /dev/null
	@mkdir -p $(BUILD_DIR)/$(SAFARI_DIR)/pkg > /dev/null
	@cp $(MANIFEST) $(BUILD_DIR)/$(SAFARI_DIR)/src
	@cp -r $(HTML) $(BUILD_DIR)/$(SAFARI_DIR)/src
	@cp -r $(IMAGES) $(BUILD_DIR)/$(SAFARI_DIR)/src
	@cp -r $(JS) $(BUILD_DIR)/$(SAFARI_DIR)/src
	@cp -r $(CSS) $(BUILD_DIR)/$(SAFARI_DIR)/src
	@$(XCRUN) safari-web-extension-converter $(BUILD_DIR)/$(SAFARI_DIR)/src --app-name "$(APP_NAME)" --bundle-identifier "dev.fcalefato.$(APP_NAME)" --project-location $(BUILD_DIR)/$(SAFARI_DIR) --no-prompt --no-open --force --macos-only
	@cd $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME) && $(XCODEBUILD) -quiet -target $(APP_NAME) -configuration Release clean build
	@zip $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME)-appex-$(APP_VERSION).zip $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME)/build/Release/$(APP_NAME).app
	@touch $(SAFARI_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: build/chrome
build/chrome: $(CHROME_BUILD_TIMESTAMP)  ## Build Chrome extension zip
$(CHROME_BUILD_TIMESTAMP): $(SRC_FILES) $(MANIFEST)
	@echo -e "$(CYAN)\nBuilding Chrome extension...$(RESET)"
	@mkdir -p $(BUILD_DIR)/$(CHROME_DIR) > /dev/null
	@zip -r -FS $(BUILD_DIR)/$(CHROME_DIR)/$(APP_NAME)-ext-$(APP_VERSION).zip $(SRC) -x \*.DS_Store
	@touch $(CHROME_BUILD_TIMESTAMP)
	@echo -e "$(GREEN)Done$(RESET)"

.PHONY: build/edge
build/edge: build/chrome  ## Build Edge extension zip (same as Chrome)

.PHONY: build/all
build/all: build/chrome build/firefox build/safari  ## Build all extensions (alias: build)
	@echo -e "$(CYAN)\nAll extensions built.$(RESET)"

.PHONY: build/clean
build/clean:  ## Clean up build directory and remove all timestamps
	@echo -e "$(CYAN)\nCleaning up $(BUILD_DIR) directory...$(RESET)"
	@rm -rf $(BUILD_DIR)/$(FIREFOX_DIR)
	@rm -rf $(BUILD_DIR)/$(SAFARI_DIR)
	@rm -rf $(BUILD_DIR)/$(CHROME_DIR)
	@rm -f $(STAMP_FILES)
	@echo -e "$(GREEN)Done.$(RESET)"

#-- Release

define update_version
    echo -e "$(CYAN)\nBump version from $(APP_VERSION) to $(1)$(RESET)" && \
    cat $(MANIFEST) | $(SED) -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(1)\"/" > $(MANIFEST_TMP) && \
    mv $(MANIFEST_TMP) $(MANIFEST) && \
    cat $(MANIFEST_FIREFOX) | $(SED) -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(1)\"/" > $(MANIFEST_TMP) && \
    mv $(MANIFEST_TMP) $(MANIFEST_FIREFOX) && \
    cat package.json | $(SED) -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(1)\"/" > $(MANIFEST_TMP) && \
    mv $(MANIFEST_TMP) package.json && \
    echo -e "$(GREEN)Version updated.$(RESET)"
endef

.PHONY: bump/patch
bump/patch: | release/check  ## Bump patch version (e.g., 1.0.0 -> 1.0.1)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$NF++; print $$0}') ; \
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
	@$(eval TAG := $(shell echo v$(APP_VERSION)))
	@$(eval REMOTE_TAGS := $(shell $(GIT) ls-remote --tags origin | $(AWK) '{print $$2}'))
	@if echo $(REMOTE_TAGS) | grep -q $(TAG); then \
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
	@TAG=$$($(GIT) describe --tags --abbrev=0); \
	BEHIND_AHEAD=$$($(GIT) rev-list --left-right --count $$TAG...origin/main); \
	if [ "$$BEHIND_AHEAD" = "0	0" ]; then echo "false" > $(RELEASE_STAMP); else echo "true" > $(RELEASE_STAMP); fi; \
	echo -e "$(CYAN)\nChecking if a new release is needed...$(RESET)"; \
	echo -e "  $(CYAN)Current tag:$(RESET) $$TAG"; \
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

.PHONY: run/chrome
run/chrome: | dep/chrome  ## Run Chrome extension in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Chrome extension...$(RESET)"
	@echo -e "${ORANGE}Make sure Chrome is not already running.${RESET}"
	@open -a "$(CHROME_APP)" --args \
		--auto-open-devtools-for-tabs \
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
		--load-extension=$(WORK_DIR) \
		$(DEFAULT_URL)

.PHONY: run/edge
run/edge: | dep/edge   ## Run Edge extension (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nOpening Edge extension...$(RESET)"
	@echo -e "${ORANGE}Make sure Edge is not already running. (Note: Edge does not support development mode for extensions).${RESET}"
	@open -a "$(EDGE_APP)" --args \
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
		--load-extension=$(WORK_DIR) \
		$(DEFAULT_URL)

.PHONY: run/firefox
run/firefox: | dep/firefox build/firefox ## Run Firefox addon in development mode (use DEFAULT_URL="..." to set the opening page)
	@echo -e "$(CYAN)\nRunning Firefox addon...$(RESET)"
	@cd $(BUILD_DIR)/$(FIREFOX_DIR)/src && web-ext run --firefox="/Applications/$(FIREFOX_APP)/Contents/MacOS/firefox" \
		--source-dir=$(APP_NAME)-addon-$(APP_VERSION) \
		--start-url=$(DEFAULT_URL)

.PHONY: run/safari
run/safari: | dep/safari build/safari  ## Run Safari app-extension 
	@echo -e "$(CYAN)\nRunning Safari app-extension...$(RESET)"
	@echo -e "${ORANGE}Note that the extension is not signed, you need to go to 'Settings' > Select 'Developer' tab > Check the 'Allow unsigned extensions' box.${RESET}"
	@open -a $(BUILD_DIR)/$(SAFARI_DIR)/$(APP_NAME)/build/Release/$(APP_NAME).app
	