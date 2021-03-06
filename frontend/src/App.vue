<template>
  <v-app id="app" class="vld-parent">
    <loading
      :active.sync="showBusyIndicator"
      :is-full-page="true"
      :height="64"
      :width="64"
      :color="isLoadingColor"
      background-color="transparent"
      loader="spinner"
    ></loading>

    <Header
      v-if="prompts.length"
      :headerTitle="headerTitle"
      :stepName="promptIndex < prompts.length ? prompts[promptIndex].name : ''"
      :rpc="rpc"
      :isInVsCode="isInVsCode()"
      :isGeneric="isGeneric"
      @parentShowConsole="toggleConsole"
    />

    <v-row class="main-row ma-0 pa-0">
      <v-col class="left-col ma-0 pa-0" cols="3">
        <Navigation
          v-if="prompts.length"
          :promptIndex="promptIndex"
          :prompts="prompts"
          @onGotoStep="gotoStep"
        />
      </v-col>
      <v-col cols="9" class="right-col">
        <v-row class="prompts-col">
          <v-col>
            <Done
              v-if="isDone"
              :doneStatus="doneStatus"
              :doneMessage="doneMessage"
              :donePath="donePath"
            />

            <PromptInfo
              v-if="currentPrompt && !isDone"
              :currentPrompt="currentPrompt"
            />
            <v-slide-x-transition>
              <Form
                ref="form"
                :questions="currentPrompt ? currentPrompt.questions : []"
                @parentExecuteCommand="executeCommand"
                @answered="onAnswered"
              />
            </v-slide-x-transition>
            <Info
              v-if="isNoGenerators"
              :infoMessage="messages ? messages.select_generator_not_found : ``"
              :infoUrl="'https://wwww.sap.com'"
            />
          </v-col>
        </v-row>
        <v-divider bold></v-divider>
        <v-row
          v-if="prompts.length > 0 && !isDone && showButtons"
          style="height: 4rem; margin: 0; align-items: left"
          sm="auto"
        >
          <div class="bottom-buttons-col" style="display: flex">
            <v-btn
              id="back"
              :disabled="promptIndex < 1 || isReplaying"
              @click="back"
              v-show="promptIndex > 0"
              style="min-width: 90px"
            >
              <v-icon left>mdi-chevron-left</v-icon>{{ backButtonText }}
            </v-btn>
            <v-btn
              id="next"
              :disabled="!stepValidated"
              @click="next"
              style="min-width: 90px"
            >
              {{ nextButtonText }}
              <v-icon right v-if="nextButtonText !== `Finish`"
                >mdi-chevron-right</v-icon
              >
            </v-btn>
          </div>
          <div class="prompt-message" v-if="toShowPromptMessage">
            <img
              style="vertical-align: middle; padding-left: 12px"
              :src="promptMessageIcon"
              alt=""
            />
            <v-tooltip
              right
              :disabled="promptMessageToDisplay.length < this.messageMaxLength"
            >
              <template v-slot:activator="{ on }">
                <span :class="promptMessageClass" v-on="on">{{
                  showPrompt
                }}</span>
              </template>
              <span>{{ promptMessageToDisplay }}</span>
            </v-tooltip>
          </div>
          <v-spacer />
        </v-row>
      </v-col>
    </v-row>

    <!-- TODO Handle scroll of above content when console is visible. low priority because it is for localhost console only -->
    <v-card :class="consoleClass" v-show="showConsole">
      <v-footer
        absolute
        class="font-weight-medium"
        style="max-height: 300px; overflow-y: auto"
      >
        <v-col class cols="12">
          <div id="logArea" placeholder="No log entry">{{ logText }}</div>
        </v-col>
      </v-footer>
    </v-card>
  </v-app>
</template>

<script>
import Vue from "vue";
import Loading from "vue-loading-overlay";
import Header from "./components/Header.vue";
import Navigation from "./components/Navigation.vue";
import Done from "./components/Done.vue";
import Info from "./components/Info.vue";
import PromptInfo from "./components/PromptInfo.vue";
import { RpcBrowser } from "@sap-devx/webview-rpc/out.browser/rpc-browser";
import { RpcBrowserWebSockets } from "@sap-devx/webview-rpc/out.browser/rpc-browser-ws";
import * as _ from "lodash";
import FileBrowserPlugin from "@sap-devx/inquirer-gui-file-browser-plugin";
import FolderBrowserPlugin from "@sap-devx/inquirer-gui-folder-browser-plugin";
import LoginPlugin from "@sap-devx/inquirer-gui-login-plugin";
import TilesPlugin from "@sap-devx/inquirer-gui-tiles-plugin";
import LabelPlugin from "@sap-devx/inquirer-gui-label-plugin";
import { Severity } from "@sap-devx/yeoman-ui-types";

const FUNCTION = "__Function";
const PENDING = "pending";
const EVALUATING = "evaluating";
const INSTALLING = "Installing dependencies...";

function initialState() {
  return {
    generatorName: "",
    generatorPrettyName: "",
    stepValidated: false,
    prompts: [],
    promptIndex: 0,
    rpc: Object,
    resolve: Object,
    reject: Object,
    isDone: false,
    doneMessage: Object,
    doneStatus: false,
    consoleClass: "",
    logText: "",
    showConsole: false,
    messages: {},
    showBusyIndicator: false,
    promptsInfoToDisplay: [],
    isReplaying: false,
    numOfSteps: 1,
    isGeneric: false,
    isToolsSuiteTypeGen: false,
    isWriting: false,
    showButtons: true,
    promptMessageToDisplay: "",
    shortPrompt: "",
    toShowPromptMessage: false,
    promptMessageClass: "",
    promptMessageIcon: null,
    messageMaxLength: 100
  };
}

export default {
  name: "app",
  components: {
    Header,
    Navigation,
    Done,
    Info,
    PromptInfo,
    Loading,
  },
  data() {
    return initialState();
  },
  computed: {
    backButtonText() {
      if (this.promptIndex === 1 && this.selectGeneratorPromptExists()) {
        return "Start Over";
      }
      return "Back";
    },
    nextButtonText() {
      if ((!this.selectGeneratorPromptExists() && this.promptIndex === (_.size(this.promptsInfoToDisplay) - 1)) || 
        (this.selectGeneratorPromptExists() && this.promptIndex > 0 && this.promptIndex === _.size(this.promptsInfoToDisplay)) ||
        this.isWriting
      ) {
        return "Finish";
      } else if (this.isGeneratorsPrompt()) {
        return "Start";
      }
      return "Next";
    },
    isLoadingColor() {
      return (
        getComputedStyle(document.documentElement).getPropertyValue(
          "--vscode-progressBar-background"
        ) || "#0e70c0"
      );
    },
    headerTitle() {
      const titleSuffix = _.isEmpty(this.generatorPrettyName)
        ? ""
        : ` - ${this.generatorPrettyName}`;
      return `${_.get(this.messages, "yeoman_ui_title")}${titleSuffix}`;
    },
    currentPrompt() {
      return _.get(this.prompts, "[" + this.promptIndex + "]");
    },
    isNoGenerators() {
      const promptName = _.get(this.currentPrompt, "name");
      const message = _.get(this.messages, "select_generator_name", "");
      if (promptName && promptName === message) {
        const questions = _.compact(_.get(this.currentPrompt, "questions"));
        const generatorQuestion = _.find(questions, (question) => {
          return _.get(question, "name") === "generator";
        });
        return _.isEmpty(_.get(generatorQuestion, "choices"));
      }
      return false;
    },
  },
  watch: {
    prompts: {
      handler() {
        this.setBusyIndicator();
      },
    },
    "currentPrompt.status": {
      handler() {
        this.setBusyIndicator();
      },
    },
    isDone: {
      handler() {
        this.setBusyIndicator();
      },
    },
  },
  methods: {
    showPromptMessage(message, type, image) {
      this.promptMessageToDisplay = message;
      this.showPrompt =
        message.length < this.messageMaxLength
          ? message
          : message.substr(0, this.messageMaxLength) + "...";
      this.toShowPromptMessage = true;
      this.promptMessageIcon = image;

      if (type === Severity.error) {
        this.promptMessageClass = "error-prompt-message";
      } else if (type === Severity.information) {
        this.promptMessageClass = "info-warn-prompt-message";
      } else if (type === Severity.warning) {
        this.promptMessageClass = "info-warn-prompt-message";
      }
    },
    setBusyIndicator() {
      this.showBusyIndicator =
        _.isEmpty(this.prompts) ||
        (this.currentPrompt &&
          (this.currentPrompt.status === PENDING ||
            this.currentPrompt.status === EVALUATING) &&
          !this.isDone);
    },
    executeCommand(event) {
      const command = event.target.getAttribute("command");
      const params = event.target.getAttribute("params");
      this.rpc.invoke("executeCommand", [command, params]);
    },
    back() {
      this.gotoStep(1); // go 1 step back
    },
    gotoStep(numOfSteps) {
      // go numOfSteps step back
      try {
        this.toShowPromptMessage = false;
        this.isReplaying = true;
        this.numOfSteps = numOfSteps;
        const answers = this.currentPrompt.answers;
        if (this.promptIndex - numOfSteps > 0) {
          this.rpc.invoke("back", [answers, numOfSteps]);
        } else {
          this.reload();
        }
      } catch (error) {
        this.rpc.invoke("logError", [error]);
        this.reject(error);
      }
    },
    setGenInWriting(value) {
      this.isWriting = value;
      this.showButtons = !this.isWriting;
      if (this.currentPrompt) {
        this.currentPrompt.name = this.getInProgressStepName();
      }
    },
    getInProgressStepName() {
      return this.isWriting
        ? _.get(this.messages, "step_is_generating")
        : _.get(this.messages, "step_is_pending");
    },
    next() {
      this.toShowPromptMessage = false;
      if (this.resolve) {
        try {
          this.resolve(this.currentPrompt.answers);
        } catch (error) {
          this.rpc.invoke("logError", [error]);
          this.reject(error);
          return;
        }
      }
      if (this.promptIndex >= _.size(this.prompts) - 1) {
        const prompt = {
          questions: [],
          name: this.getInProgressStepName(),
          status: PENDING,
        };
        this.setPrompts([prompt]);
      }
      this.stepValidated = false;
      this.promptIndex++;
      this.prompts[this.promptIndex - 1].active = false;
      this.prompts[this.promptIndex].active = true;
    },
    onAnswered(answers, issues) {
      this.stepValidated = issues === undefined;
      const currentPrompt = this.currentPrompt;
      if (currentPrompt) {
        currentPrompt.answers = answers;
        if (currentPrompt.answers.generator) {
          this.isToolsSuiteTypeGen = this.isToolsSuiteType(currentPrompt.answers.generator);
        }
        if (currentPrompt.status === EVALUATING) {
          currentPrompt.status = undefined;
        }
      }

    },
    isToolsSuiteType(genName) {
      const questions = _.compact(_.get(this.currentPrompt, "questions"));
      const generatorQuestion = _.find(questions, (question) => {
        return _.get(question, "name") === "generator";
      });
      if (generatorQuestion){
        const choices = _.compact(_.get(generatorQuestion, "choices"));
        if (choices){
          const isToolsSuiteGen = _.find(choices, (choice) => {
            return _.get(choice, "isToolsSuiteType") === true && _.get(choice, "value") === genName;
          });
          return (_.isEmpty(isToolsSuiteGen) === false);
        }
      }
      return false;
    },
    selectGeneratorPromptExists() {
      const firstPromptQuestions = _.get(this, "prompts[0].questions", []);
      return !_.isNil(_.find(firstPromptQuestions, question => {
        return _.get(question, "name") === "generator" && 
              _.get(question, "type") === "list" && 
              _.get(question, "guiType") === "tiles";
      }));
    },
    setPromptList(prompts) {
      let promptIndex = this.promptIndex;
      if (this.isReplaying) {
        // TODO: is 1st prompt always Generator Selection?
        this.prompts = [this.prompts[0]];
        promptIndex = 0;
      }
      prompts = prompts || [];
      this.promptsInfoToDisplay = _.cloneDeep(prompts);

      // replace all existing prompts except 1st (generator selection) and current prompt
      // The index at which to start changing the array.
      let startIndex = promptIndex; 
      if (this.selectGeneratorPromptExists()) {
        startIndex = promptIndex + 1;
      }
      
      // The number of elements in the array to remove from startIndex
      const deleteCount = _.size(this.prompts) - promptIndex; 

      let itemsToInsert; 
      if (this.selectGeneratorPromptExists() || promptIndex === 0) {
        itemsToInsert = prompts.splice(promptIndex, _.size(prompts));       
      } else {
        startIndex = promptIndex + 1;
        itemsToInsert = prompts.splice(startIndex, _.size(prompts));
      }

      this.prompts.splice(startIndex, deleteCount, ...itemsToInsert);
    },
    setPrompts(prompts) {
      const firstIncomingPrompt = _.get(prompts, "[0]");
      if (firstIncomingPrompt) {
        let startIndex = this.promptIndex;
        let deleteCount = prompts.length;
        if (!this.currentPrompt || firstIncomingPrompt.status === PENDING) {
          startIndex = this.promptIndex + 1;
          deleteCount = 0;
        }
        this.prompts.splice(startIndex, deleteCount, ...prompts);
      }
    },
    prepQuestions(questions) {
      if (this.currentPrompt) {
        this.currentPrompt.status = EVALUATING;
      }

      for (let question of questions) {
        for (let prop in question) {
          if (question[prop] === FUNCTION) {
            const that = this;
            question[prop] = async (...args) => {
              if (this.currentPrompt) {
                this.currentPrompt.status = EVALUATING;
              }

              try {
                return await that.rpc.invoke("evaluateMethod", [
                  args,
                  question.name,
                  prop,
                ]);
              } catch (e) {
                that.showBusyIndicator = false;
                throw e;
              }
            };
          }
        }
      }

      if (this.currentPrompt) {
        this.currentPrompt.status = undefined;
      }
    },

    async updateGeneratorsPrompt(questions) {
      const generatorsPrompt = _.get(this.prompts, "[0]");
      if (generatorsPrompt) {
        generatorsPrompt.questions = questions;
      }
    },

    isGeneratorsPrompt() {
      return (this.promptIndex === 0 && this.selectGeneratorPromptExists());
    },

    async showPrompt(questions, name) {
      this.prepQuestions(questions);
      if (this.isReplaying) {
        this.promptIndex -= this.numOfSteps;
        this.isReplaying = false;
      }
      const prompt = this.createPrompt(questions, name);
      this.setPrompts([prompt]);
      if (this.isWriting) {
        this.showButtons = true;
      }
      const promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
      if (this.nextButtonText === "Finish" && this.isToolsSuiteTypeGen) {
        const message = "The generated project will not open in a new workspace.";
        const image = "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+DQo8c3ZnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSIxNyIgaGVpZ2h0PSIxNyIgdmlld0JveD0iMCAwIDE3IDE3Ij4NCiAgPGRlZnM+DQogICAgPGNsaXBQYXRoIGlkPSJjbGlwLWluZm9fdmNvZGUiPg0KICAgICAgPHJlY3Qgd2lkdGg9IjE3IiBoZWlnaHQ9IjE3Ii8+DQogICAgPC9jbGlwUGF0aD4NCiAgPC9kZWZzPg0KICA8ZyBpZD0iaW5mb192Y29kZSIgY2xpcC1wYXRoPSJ1cmwoI2NsaXAtaW5mb192Y29kZSkiPg0KICAgIDxnIGlkPSJHcm91cF8zNTQ0IiBkYXRhLW5hbWU9Ikdyb3VwIDM1NDQiPg0KICAgICAgPGcgaWQ9Ikdyb3VwXzM1NDMiIGRhdGEtbmFtZT0iR3JvdXAgMzU0MyI+DQogICAgICAgIDxnIGlkPSJHcm91cF8zNTQyIiBkYXRhLW5hbWU9Ikdyb3VwIDM1NDIiPg0KICAgICAgICAgIDxnIGlkPSJFbGxpcHNlXzU0IiBkYXRhLW5hbWU9IkVsbGlwc2UgNTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzZmYmFmNyIgc3Ryb2tlLXdpZHRoPSIxLjUiPg0KICAgICAgICAgICAgPGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSI4LjUiIHN0cm9rZT0ibm9uZSIvPg0KICAgICAgICAgICAgPGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSI3Ljc1IiBmaWxsPSJub25lIi8+DQogICAgICAgICAgPC9nPg0KICAgICAgICAgIDxwYXRoIGlkPSJQYXRoXzE2NDAiIGRhdGEtbmFtZT0iUGF0aCAxNjQwIiBkPSJNMTg1Mi41LTI3NzkuNzMxdjQuNTA2IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTg0NCAyNzg3Ljc1KSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNmZiYWY3IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ii8+DQogICAgICAgICAgPHBhdGggaWQ9IlBhdGhfMTY0MSIgZGF0YS1uYW1lPSJQYXRoIDE2NDEiIGQ9Ik0xODUyLjUtMjc3NC43MzFoMCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTE4NDQgMjc4MCkiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzZmYmFmNyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2Utd2lkdGg9IjIiLz4NCiAgICAgICAgPC9nPg0KICAgICAgPC9nPg0KICAgIDwvZz4NCiAgPC9nPg0KPC9zdmc+DQo=";
        this.showPromptMessage(message, Severity.information, image);
      }
      promise.then(() => {
        if (this.isWriting) {
          this.showButtons = false;
        }
      });

      return promise;
    },
    createPrompt(questions, name) {
      let promptDescription = "";
      let promptName = "";
      if (name === "select_generator") {
        promptDescription = _.get(
          this.messages,
          "select_generator_description"
        );
        promptName = _.get(this.messages, "select_generator_name");
      } else {
        const promptIndex = this.selectGeneratorPromptExists() ? (this.promptIndex - 1) : this.promptIndex;
        const promptToDisplay = _.get(this.promptsInfoToDisplay, `[${promptIndex}]`);
        promptDescription = _.get(promptToDisplay, "description", "");
        promptName = _.get(promptToDisplay, "name", name);
      }

      const prompt = Vue.observable({
        questions: questions,
        name: promptName,
        description: promptDescription,
        answers: {},
        active: true,
        status: _.get(this.currentPrompt, "status"),
      });
      return prompt;
    },
    log(log) {
      this.logText += log;
      return true;
    },
    generatorInstall() {
      this.currentPrompt.name = "Installing";
      this.doneMessage = INSTALLING;
      this.donePath = "";
      this.doneStatus = true;
      this.isDone = true;
    },
    generatorDone(succeeded, message, targetPath) {
      this.currentPrompt.name = "Summary";
      this.doneMessage = message;
      this.donePath = targetPath;
      this.doneStatus = succeeded;
      this.isDone = true;
    },
    runGenerator(generatorName) {
      this.rpc.invoke("runGenerator", [generatorName]);
    },
    isInVsCode() {
      return typeof acquireVsCodeApi !== "undefined";
    },
    getVsCodeApi() {
      if (this.isInVsCode()) {
        if (!window.vscode) {
          // eslint-disable-next-line
          window.vscode = acquireVsCodeApi();
        }

        return window.vscode;
      }
    },
    setupRpc() {
      /* istanbul ignore if */
      if (this.isInVsCode()) {
        this.rpc = new RpcBrowser(window, this.getVsCodeApi());
        this.initRpc();
      } else {
        const ws = new WebSocket("ws://127.0.0.1:8081");
        /* istanbul ignore next */
        ws.onopen = () => {
          this.rpc = new RpcBrowserWebSockets(ws);
          this.initRpc();
        };
      }
    },
    initRpc() {
      const functions = [
        "showPrompt",
        "setPromptList",
        "generatorInstall",
        "generatorDone",
        "log",
        "updateGeneratorsPrompt",
        "isGeneratorsPrompt",
        "setGenInWriting",
        "showPromptMessage",
      ];
      _.forEach(functions, (funcName) => {
        this.rpc.registerMethod({
          func: this[funcName],
          thisArg: this,
          name: funcName,
        });
      });

      this.displayGeneratorsPrompt();
    },
    async setMessagesAndSaveState() {
      const uiOptions = await this.rpc.invoke("getState");
      this.messages = _.get(uiOptions, "messages");
      this.isGeneric = _.get(this.messages, "panel_title") === "Template Wizard";
      const vscodeApi = this.getVsCodeApi();
      if (vscodeApi) {
        vscodeApi.setState(uiOptions);
      }
    },
    async displayGeneratorsPrompt() {
      await this.setMessagesAndSaveState();
      await this.rpc.invoke("receiveIsWebviewReady", []);
    },
    toggleConsole() {
      this.showConsole = !this.showConsole;
    },
    registerPlugin(plugin) {
      const options = {};
      Vue.use(plugin, options);
      if (options.plugin) {
        const registerPluginFunc = _.get(this.$refs, "form.registerPlugin");
        registerPluginFunc(options.plugin);
      }
    },
    init() {
      // register custom inquirer-gui plugins
      this.registerPlugin(FileBrowserPlugin);
      this.registerPlugin(FolderBrowserPlugin);
      this.registerPlugin(LoginPlugin);
      this.registerPlugin(TilesPlugin);
      this.registerPlugin(LabelPlugin);

      this.isInVsCode()
        ? (this.consoleClass = "consoleClassHidden")
        : (this.consoleClass = "consoleClassVisible");
    },
    reload() {
      const dataObj = initialState();
      dataObj.rpc = this.rpc;
      Object.assign(this.$data, dataObj);
      this.init();

      this.displayGeneratorsPrompt();
    },
  },
  created() {
    this.setupRpc();
  },
  mounted() {
    this.init();
  },
};
</script>
<style scoped>
@import "./../node_modules/vue-loading-overlay/dist/vue-loading.css";
.consoleClassVisible {
  visibility: visible;
}
.consoleClassHidden {
  visibility: hidden;
}
div.consoleClassVisible .v-footer {
  background-color: var(--vscode-editor-background, #1e1e1e);
  color: var(--vscode-foreground, #cccccc);
}
#logArea {
  font-family: monospace;
  word-wrap: break-word;
  white-space: pre-wrap;
}
.left-col {
  background-color: var(--vscode-editorWidget-background, #252526);
}
.prompts-col {
  overflow-y: auto;
  margin: 0px;
}
.main-row,
.prompts-col {
  height: calc(100% - 4rem);
}
.left-col,
.right-col,
.right-row,
#step-component-div,
#QuestionTypeSelector,
#QuestionTypeSelector > .col,
#QuestionTypeSelector > .col > div {
  height: 100%;
}
.right-col {
  padding: 0 !important;
}
.bottom-left-col {
  background: var(--vscode-editor-background, #1e1e1e);
  overflow: hidden;
  margin: 0px;
}
.bottom-buttons-col {
  padding: 12px;
  padding-right: 0px;
  margin: auto !important;
}
.bottom-buttons-col > .v-btn:not(:last-child) {
  margin-right: 10px !important;
}
.prompt-message {
  padding: 12px;
  margin: auto;
}
/* Error prompt message*/
.error-prompt-message {
  font-size: 14px;
  padding-left: 12px;
  color: #ff5252;
  vertical-align: middle;
}
/* Info and Warning prompt message*/
.info-warn-prompt-message {
  color: var(--vscode-editorCodeLens-foreground, #999999);
  padding-left: 12px;
  font-size: 14px;
  vertical-align: middle;
}
.v-divider {
  border-top: 2px solid var(--vscode-editorWidget-background, #252526) !important;
}
.theme--light.v-btn.v-btn--disabled:not(.v-btn--flat):not(.v-btn--text):not(.v-btn--outlined) {
  background-color: var(--vscode-descriptionForeground, #717171) !important;
}
</style>
