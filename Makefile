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
GIT_VERSION := $(shell $(GIT) --version 2> /dev/null || echo -e "\033[31mnot installed\033[0m")
XCRUN := $(shell command -v xcrun 2> /dev/null)
XCRUN_VERSION := $(shell $(XCRUN) --version 2> /dev/null || echo -e "\033[31mnot installed\033[0m")
XCODEBUILD := $(shell command -v xcodebuild 2> /dev/null || echo -e "\033[31mnot installed\033[0m")

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
RELEASE_TIMESTAMP := .release.stamp
CHROME_BUILD_TIMESTAMP := .chrome.stamp
FIREFOX_BUILD_TIMESTAMP := .firefox.stamp
SAFARI_BUILD_TIMESTAMP := .safari.stamp
STAGING_STAMP := .staging.stamp
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
	@xcode-select -p || "echo 'Xcode is not installed.'"

.PHONY: dep/macos
dep/macos:
	@echo -e "$(CYAN)\nChecking if OS is MacOS...$(RESET)"
	@uname -s | grep "Darwin" || "echo 'Run targets are only available on MacOS.'"

.PHONY: dep/chrome
dep/chrome: | dep/macos
	@echo -e "$(CYAN)\nChecking if Google Chrome is installed...$(RESET)"
	@ls /Applications | grep -x "$(CHROME_APP)" || echo -e "$(RED)Google Chrome is not installed.$(RESET)"

.PHONY: dep/firefox
dep/firefox: | dep/macos
	@echo -e "$(CYAN)\nChecking if Firefox Developer Edition is installed...$(RESET)"
	@ls /Applications | grep -x "$(FIREFOX_APP)" || echo -e "$(RED)Firefox Developer Edition is not installed.$(RESET)"
	@echo -e "$(CYAN)\nChecking if web-ext is installed...$(RESET)"
	@web-ext --version || echo -e "$(RED)web-ext is not installed.$(RESET)"

.PHONY: dep/edge
dep/edge: | dep/macos
	@echo -e "$(CYAN)\nChecking if Microsoft Edge is installed...$(RESET)"
	@ls /Applications | grep -x "$(EDGE_APP)" || echo -e "$(RED)Microsoft Edge is not installed.$(RESET)"

.PHONY: dep/safari
dep/safari: | dep/macos
	@echo -e "$(CYAN)\nChecking if Safari is installed...$(RESET)"
	@ls /Applications | grep -x "$(SAFARI_APP)" || echo -e "$(RED)Safari is not installed.$(RESET)"

#-- Build targets

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
buid/edge:  ## Build Edge extension zip (same as Chrome)
	$(MAKE) build/chrome

.PHONY: clean
build/clean:  # Clean up build directory and remove all timestamps
	@echo -e "$(CYAN)\nCleaning up $(BUILD_DIR) directory...$(RESET)"
	@rm -rf $(BUILD_DIR)/$(FIREFOX_DIR)
	@rm -rf $(BUILD_DIR)/$(SAFARI_DIR)
	@rm -rf $(BUILD_DIR)/$(CHROME_DIR)
	@rm -f $(STAMP_FILES)
	@echo -e "$(GREEN)Done.$(RESET)"

.PHONY: build/all
build/all:  ## Build all extensions
	@echo -e "$(CYAN)\nBuilding all extensions...$(RESET)"
	$(MAKE) build/chrome 
	$(MAKE) build/firefox 
	$(MAKE) build/safari

#-- Release

.PHONY: tag
tag: | dep/git
	@$(eval TAG := $(shell $(GIT) describe --tags --abbrev=0))
	@$(eval BEHIND_AHEAD := $(shell $(GIT) rev-list --left-right --count $(TAG)...origin/main))
	@$(shell if [ "$(BEHIND_AHEAD)" = "0	0" ]; then echo "false" > $(RELEASE_STAMP); else echo "true" > $(RELEASE_STAMP); fi)
	@echo -e "$(CYAN)\nChecking if a new release is needed...$(RESET)"
	@echo -e "  $(CYAN)Current tag:$(RESET) $(TAG)"
	@echo -e "  $(CYAN)Commits behind/ahead:$(RESET) $(shell echo ${BEHIND_AHEAD} | tr '[:space:]' '/' | $(SED) 's/\/$$//')"
	@echo -e "  $(CYAN)Needs release:$(RESET) $(shell cat $(RELEASE_STAMP))"

.PHONY: staging
staging: | dep/git
	@if $(GIT) diff --cached --quiet; then \
		echo "true" > $(STAGING_STAMP); \
	else \
		echo "false" > $(STAGING_STAMP); \
	fi; \
	echo -e "$(CYAN)\nChecking the staging area...$(RESET)"; \
	echo -e "  $(CYAN)Staging area empty:$(RESET) $$(cat $(STAGING_STAMP))"

define update_version
    echo -e "$(CYAN)\nBump version from $(APP_VERSION) to $(1)$(RESET)" && \
    cat $(MANIFEST) | $(SED) -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(1)\"/" > $(MANIFEST_TMP) && \
    mv $(MANIFEST_TMP) $(MANIFEST) && \
    cat $(MANIFEST_FIREFOX) | $(SED) -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$(1)\"/" > $(MANIFEST_TMP) && \
    mv $(MANIFEST_TMP) $(MANIFEST_FIREFOX) && \
    $(GIT) add $(MANIFEST) $(MANIFEST_FIREFOX) && \
    $(GIT) commit -m "Bump version to $(1)"
endef

.PHONY: tag/patch
tag/patch: | tag staging  ## Bump patch semantic version in manifest files (e.g., 1.0.0 -> 1.0.1)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$NF++; print $$0}') ; \
		$(call update_version,$$NEW_VERSION) ; \
	fi

.PHONY: tag/minor
tag/minor: | tag staging  ## Bump minor semantic version in manifest files (e.g., 1.0.0 -> 1.1.0)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$(NF-1)++; $$NF=0; print $$0}') ; \
		$(call update_version,$$NEW_VERSION) ; \
	fi

.PHONY: tag/major
tag/major: | tag staging  ## Bump major semantic version in manifest files (e.g., 1.0.0 -> 2.0.0)
	@NEEDS_RELEASE=$$(cat $(RELEASE_STAMP)); \
	if [ "$$NEEDS_RELEASE" = "true" ]; then \
		NEW_VERSION=$$(echo $(APP_VERSION) | $(AWK) -F. -v OFS=. '{$$1++; $$2=0; $$3=0; print $$0}') ; \
		$(call update_version,$$NEW_VERSION) ; \
	fi

.PHONY: tag/push
tag/push: | dep/git  ## Push the tag to origin - triggers the release action
	@$(eval TAG := $(shell echo v$(APP_VERSION)))
	@$(eval REMOTE_TAGS := $(shell $(GIT) ls-remote --tags origin | $(AWK) '{print $$2}'))
	@if echo $(REMOTE_TAGS) | grep -q $(TAG); then \
		echo -e "$(ORANGE)\nNothing to push: tag $(TAG) already exists on origin.$(RESET)"; \
	else \
		echo -e "$(CYAN)\nPushing pending commits to origin...$(RESET)" ; \
		$(GIT) push origin main ; \
		echo -e "$(CYAN)\nTagging version $(TAG) and pushing to origin...$(RESET)" ; \
		$(GIT) tag $(TAG) ; \
		$(GIT) push origin $(TAG) ; \
		echo -e "$(GREEN)Done.$(RESET)" ; \
	fi

.PHONY: tag/delete 
tag/delete: | dep/git  ## Delete the tag for the current version
	$(eval tag_exists=$(shell $(GIT) rev-parse $(APP_VERSION) >/dev/null 2>&1 && echo 1 || echo 0))
	@if [ "$(tag_exists)" = "1" ]; then \
		@echo -e "$(CYAN)\nDeleting tag $(APP_VERSION)...$(RESET)"; \
		$(GIT) tag -d $(APP_VERSION) && $(GIT) push origin :refs/tags/$(APP_VERSION); \
		echo -e "$(GREEN)Done.$(RESET)" ; \
	else \
		@echo -e "$(ORANGE)Current $(APP_VERSION) is not tagged.$(RESET)"; \
	fi

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
	