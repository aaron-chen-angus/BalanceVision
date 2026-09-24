# ==============================================================================
# BalanceVision — R Shiny Analytics Dashboard
# ------------------------------------------------------------------------------
# Reads the live BalanceVision Google Sheet (public) and provides:
#   1. Scatter Explorer   – X/Y continuous, colour by category, size + opacity,
#                           brush-to-table, hover tooltip, selection statistics,
#                           optional lm/loess fit and age-reference overlay.
#   2. Distributions      – histogram/density + normality on any continuous field.
#   3. Group Comparisons  – box/violin by category + per-group summary + ANOVA/KW.
#   4. Correlations       – Pearson/Spearman heatmap + matrix table.
#   5. Left–Right Asymmetry – paired best-duration per participant + paired test.
#   6. Data Explorer      – full filterable live table + CSV download.
#
# RUN:  install.packages(c("shiny","ggplot2","shinythemes","dplyr","DT"))
#       shiny::runApp("BalanceVision_Dashboard.R")
#   (requires internet; the sheet must remain "Anyone with the link can view")
# ==============================================================================

library(shiny)
library(ggplot2)
library(tools)
library(shinythemes)
library(dplyr)
library(DT)

# ---- Data source -------------------------------------------------------------
SHEET_ID        <- "1Ly_4NAyrZkuKwGuYUwez3qEGAnNIMqvMMrOOABXbgLE"
SHEET_CSV       <- paste0("https://docs.google.com/spreadsheets/d/",
                          SHEET_ID, "/gviz/tq?tqx=out:csv")
AUTO_REFRESH_MS <- 120000   # re-poll the sheet every 2 minutes

NUM_COLS <- c("age", "trialNumber", "duration",
              "meanTorsoTilt", "maxTorsoTilt", "sdTorsoTilt",
              "meanLateralSway", "maxLateralSway", "rmsLateralSway", "sdLateralSway",
              "meanAngularVelocity", "peakAngularVelocity", "rmsAngularVelocity",
              "meanKneeAngle", "kneeVariability", "maxKneeDeviation",
              "meanPelvicTilt", "maxPelvicTilt", "pelvicVariability",
              "raisedLegVariability", "correctiveMovements", "stabilityScore")

# ---- Selectable variable menus (raw field -> readable label) -----------------
# raisedLegVariability is omitted: it is unpopulated in the current sheet.
# pelvicVariability is flagged (*) because atan2 hip-line wrap inflates its SD.
CONT_CHOICES <- c(
  "Age (years)"                   = "age",
  "Balance duration (s)"          = "duration",
  "Stability score (0-100)"       = "stabilityScore",
  "Corrective movements (count)"  = "correctiveMovements",
  "Mean torso tilt (deg)"         = "meanTorsoTilt",
  "Max torso tilt (deg)"          = "maxTorsoTilt",
  "SD torso tilt (deg)"           = "sdTorsoTilt",
  "Mean lateral sway (norm.)"     = "meanLateralSway",
  "Max lateral sway (norm.)"      = "maxLateralSway",
  "RMS lateral sway (norm.)"      = "rmsLateralSway",
  "SD lateral sway (norm.)"       = "sdLateralSway",
  "Mean angular velocity (deg/s)" = "meanAngularVelocity",
  "Peak angular velocity (deg/s)" = "peakAngularVelocity",
  "RMS angular velocity (deg/s)"  = "rmsAngularVelocity",
  "Mean knee angle (deg)"         = "meanKneeAngle",
  "Knee variability (deg)"        = "kneeVariability",
  "Max knee deviation (deg)"      = "maxKneeDeviation",
  "Mean pelvic tilt (deg)"        = "meanPelvicTilt",
  "Max pelvic tilt (deg)"         = "maxPelvicTilt",
  "Pelvic variability (deg)*"     = "pelvicVariability",
  "Trial number"                  = "trialNumber"
)

CAT_CHOICES <- c(
  "Participant type"    = "participantType",
  "Sex"                 = "sex",
  "Support leg"         = "supportLeg",
  "Age group"           = "ageGroup",
  "Performance band"    = "performanceBand",
  "Sway classification" = "swayClassification",
  "Test outcome"        = "completedFactor"
)

ALL_LABELS <- c(CONT_CHOICES, CAT_CHOICES)
pretty_lab <- function(v) {
  nm <- names(ALL_LABELS)[match(v, ALL_LABELS)]
  ifelse(is.na(nm), v, nm)
}

# ---- Load + clean ------------------------------------------------------------
load_raw <- function() {
  tryCatch(
    utils::read.csv(SHEET_CSV, stringsAsFactors = FALSE, check.names = FALSE),
    error = function(e) NULL
  )
}

clean_data <- function(df) {
  if (is.null(df) || nrow(df) == 0) return(df)
  names(df) <- trimws(names(df))

  # De-duplicate on unique record id (guards against no-cors double-POSTs)
  if ("id" %in% names(df)) df <- df[!duplicated(df$id), , drop = FALSE]

  # Coerce numeric fields
  for (nm in intersect(NUM_COLS, names(df))) {
    df[[nm]] <- suppressWarnings(as.numeric(gsub(",", "", trimws(as.character(df[[nm]])))))
  }
  # Trim remaining character fields
  for (nm in setdiff(names(df), NUM_COLS)) {
    if (is.character(df[[nm]])) df[[nm]] <- trimws(df[[nm]])
  }

  # Derived fields
  df$completed       <- grepl("^Test completed", df$terminationReason)
  df$completedFactor <- factor(ifelse(df$completed, "Completed to max", "Assessor-stopped"),
                               levels = c("Completed to max", "Assessor-stopped"))
  df$tenSecondPass   <- ifelse(!is.na(df$duration), df$duration >= 10, NA)
  df$ageGroup        <- cut(df$age,
                            breaks = c(-Inf, 17, 39, 49, 59, 69, 79, Inf),
                            labels = c("<18","18-39","40-49","50-59","60-69","70-79","80+"))

  # Prettify categoricals
  if ("participantType" %in% names(df))
    df$participantType <- factor(df$participantType,
                                 levels = c("child", "adult", "older_adult"),
                                 labels = c("Child", "Adult", "Older adult"))
  if ("sex" %in% names(df)) {
    df$sex[is.na(df$sex) | df$sex == ""] <- "unspecified"
    df$sex <- droplevels(factor(df$sex,
                                levels = c("female","male","other","unspecified"),
                                labels = c("Female","Male","Other","Unspecified")))
  }
  if ("supportLeg" %in% names(df))
    df$supportLeg <- factor(df$supportLeg, levels = c("left","right"),
                            labels = c("Left","Right"))
  if ("swayClassification" %in% names(df))
    df$swayClassification <- factor(df$swayClassification,
                                    levels = c("Low Sway","Moderate Sway","High Sway"))
  if ("performanceLabel" %in% names(df))
    df$performanceBand <- factor(
      ifelse(grepl("^Strong", df$performanceLabel), "Strong",
      ifelse(grepl("^Moderate", df$performanceLabel), "Moderate",
      ifelse(grepl("^Limited", df$performanceLabel), "Limited", NA))),
      levels = c("Strong","Moderate","Limited"))

  # Tracking-artefact flag (optional exclusion; not dropped by default)
  df$artefact <- (!is.na(df$maxTorsoTilt)        & df$maxTorsoTilt > 90) |
                 (!is.na(df$peakAngularVelocity) & df$peakAngularVelocity > 500) |
                 (!is.na(df$meanAngularVelocity) & df$meanAngularVelocity > 60)
  df
}

fmt <- function(v, d = 2) ifelse(is.na(v), "-", formatC(v, format = "f", digits = d))

# ---- Message helper ----------------------------------------------------------
# Some shiny/htmltools version combinations throw
#   "is.character(txt) is not TRUE"
# from inside validate()/need()'s message-coercion path. To be robust across
# package versions we avoid validate(need()) entirely and instead stop() with a
# plain-string message that renders as a clean notice via the wrappers below.
stop_msg <- function(msg) stop(structure(
  class = c("bvNotice", "error", "condition"),
  list(message = as.character(msg)[1], call = NULL)))

# Render a friendly notice (grey italic) for a caught bvNotice / any error.
notice_html <- function(msg)
  HTML(paste0("<em style='color:#78909c'>", htmltools::htmlEscape(as.character(msg)), "</em>"))

# A blank placeholder plot carrying a centred grey message (used when data is absent).
notice_plot <- function(msg) {
  ggplot2::ggplot() +
    ggplot2::annotate("text", x = 0, y = 0, label = as.character(msg),
                      colour = "#78909c", size = 4.5) +
    ggplot2::theme_void() +
    ggplot2::theme(plot.background  = ggplot2::element_rect(fill = "#0a1628", colour = NA),
                   panel.background = ggplot2::element_rect(fill = "#0a1628", colour = NA))
}

# Wrappers: run an expression; if a bvNotice/error is raised, show the message
# as a clean notice instead of a red "Error:" banner. These replace validate().
ui_guard <- function(expr) tryCatch(expr, error = function(e) notice_html(conditionMessage(e)))
plot_guard <- function(expr) tryCatch(expr, error = function(e) notice_plot(conditionMessage(e)))
dt_guard <- function(expr) tryCatch(expr, error = function(e)
  DT::datatable(data.frame(Note = conditionMessage(e)), rownames = FALSE,
                options = list(dom = "t")))

# ---- BalanceVision plot theme (matches web-app aesthetic + font) -------------
BV <- list(
  bg      = "#0a1628",
  surface = "#111d33",
  card    = "#162440",
  accent  = "#00e5ff",
  text    = "#ffffff",
  text2   = "#b0bec5",
  muted   = "#78909c",
  gridcol = "#243a5e",   # subtle cyan-tinted grid line
  success = "#4caf50",
  warning = "#ffab40",
  danger  = "#ef5350"
)

# Cyan-forward discrete palette echoing the app's accent-led look
BV_DISCRETE <- c("#00e5ff", "#4caf50", "#ffab40", "#ef5350",
                 "#7c9cff", "#b388ff", "#26c6da", "#ffd54f")

# Discrete + gradient scales that mirror the app colours
scale_bv_d <- function(...) ggplot2::scale_colour_manual(values = BV_DISCRETE, na.value = "grey60", ...)
scale_bv_fill_d <- function(...) ggplot2::scale_fill_manual(values = BV_DISCRETE, na.value = "grey60", ...)

theme_bv <- function(base_size = 13) {
  ggplot2::theme_minimal(base_size = base_size) +
    ggplot2::theme(
      plot.background   = ggplot2::element_rect(fill = BV$bg,   colour = NA),
      panel.background  = ggplot2::element_rect(fill = BV$card, colour = NA),
      panel.grid.major  = ggplot2::element_line(colour = BV$gridcol, linewidth = 0.3),
      panel.grid.minor  = ggplot2::element_blank(),
      text              = ggplot2::element_text(colour = BV$text2),
      plot.title        = ggplot2::element_text(colour = BV$accent, face = "bold"),
      axis.title        = ggplot2::element_text(colour = BV$text2),
      axis.text         = ggplot2::element_text(colour = BV$text2),
      legend.background = ggplot2::element_rect(fill = BV$bg, colour = NA),
      legend.key        = ggplot2::element_rect(fill = BV$card, colour = NA),
      legend.text       = ggplot2::element_text(colour = BV$text2),
      legend.title      = ggplot2::element_text(colour = BV$text2)
    )
}

# ==============================================================================
# UI
# ==============================================================================
ui <- fluidPage(
  theme = shinytheme("cyborg"),
  tags$head(tags$style(HTML("
    /* ── BalanceVision app theme (matches web app aesthetic + font) ──────── */
    :root{
      --bv-bg:#0a1628; --bv-surface:#111d33; --bv-card:#162440;
      --bv-card-hover:#1c2d50; --bv-accent:#00e5ff;
      --bv-text:#ffffff; --bv-text-2:#b0bec5; --bv-text-muted:#78909c;
      --bv-border:rgba(0,229,255,0.2);
      --bv-success:#4caf50; --bv-warning:#ffab40; --bv-danger:#ef5350;
    }
    html, body, .container-fluid{
      background:var(--bv-bg) !important;
      color:var(--bv-text);
      font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    }
    body{ -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; }

    h1,h2,h3,h4,h5{ color:var(--bv-text); font-weight:600; }
    .shiny-html-output h4, h4{ color:var(--bv-accent); }
    p, label, .control-label{ color:var(--bv-text-2); }
    a{ color:var(--bv-accent); }
    hr{ border-top:1px solid var(--bv-border); }

    /* Title */
    h2.title, .title{ color:var(--bv-accent); font-weight:700; letter-spacing:-0.5px; }

    /* Panels / cards */
    .well, .tab-content, .shiny-input-container{ color:var(--bv-text-2); }
    .well{
      background:var(--bv-surface) !important;
      border:1px solid var(--bv-border) !important;
      border-radius:12px;
      box-shadow:0 4px 24px rgba(0,0,0,0.3);
    }
    .sidebarPanel, .col-sm-3 .well{ background:var(--bv-surface) !important; }

    /* KPI tiles */
    .kpi{
      background:var(--bv-card); border:1px solid var(--bv-border);
      border-radius:12px; padding:14px 12px; text-align:center;
      box-shadow:0 4px 24px rgba(0,0,0,0.3);
    }
    .kpi .v{ font-size:26px; font-weight:700; color:var(--bv-accent); }
    .kpi .l{ font-size:12px; color:var(--bv-text-muted); text-transform:uppercase; letter-spacing:1px; }
    .small-note{ font-size:12px; color:var(--bv-text-muted); }

    /* Tabs */
    .nav-tabs{ border-bottom:1px solid var(--bv-border); }
    .nav-tabs > li > a{
      color:var(--bv-text-2); border:none; background:transparent;
      border-radius:8px 8px 0 0;
    }
    .nav-tabs > li > a:hover{ background:var(--bv-card); color:var(--bv-accent); border-color:transparent; }
    .nav-tabs > li.active > a,
    .nav-tabs > li.active > a:hover,
    .nav-tabs > li.active > a:focus{
      background:var(--bv-card); color:var(--bv-accent);
      border:1px solid var(--bv-border); border-bottom-color:var(--bv-card);
    }

    /* Inputs */
    .form-control, .selectize-input, .selectize-dropdown{
      background:var(--bv-card) !important; color:var(--bv-text) !important;
      border:1px solid var(--bv-border) !important; border-radius:8px;
    }
    .form-control:focus, .selectize-input.focus{
      border-color:var(--bv-accent) !important;
      box-shadow:0 0 0 2px var(--bv-accent) !important;
    }
    .selectize-dropdown .active{ background:var(--bv-accent) !important; color:var(--bv-bg) !important; }
    .irs-bar, .irs-bar-edge, .irs-single, .irs-from, .irs-to{
      background:var(--bv-accent) !important; border-color:var(--bv-accent) !important; color:var(--bv-bg) !important;
    }
    .irs-line{ background:var(--bv-card) !important; }

    /* Buttons */
    .btn, .btn-default{
      background:var(--bv-card); color:var(--bv-text);
      border:1px solid var(--bv-border); border-radius:12px; font-weight:600;
    }
    .btn:hover, .btn-default:hover{ background:var(--bv-card-hover); border-color:var(--bv-accent); color:var(--bv-text); }
    .btn-primary{ background:var(--bv-accent) !important; color:var(--bv-bg) !important; border:none; font-weight:600; }
    .btn-primary:hover{ background:#33ecff !important; color:var(--bv-bg) !important; box-shadow:0 4px 20px rgba(0,229,255,0.3); }

    /* Checkboxes / radios accent */
    input[type=checkbox], input[type=radio]{ accent-color:var(--bv-accent); }

    /* DataTables (dark) */
    .dataTables_wrapper{ color:var(--bv-text-2); }
    table.dataTable{ color:var(--bv-text-2); }
    table.dataTable thead th{ color:var(--bv-accent); border-bottom:1px solid var(--bv-border) !important; }
    table.dataTable tbody td{ border-top:1px solid rgba(0,229,255,0.08) !important; }
    table.dataTable.stripe tbody tr.odd,
    table.dataTable.display tbody tr.odd{ background:rgba(255,255,255,0.02); }
    table.dataTable tbody tr:hover{ background:var(--bv-card-hover) !important; }
    .dataTables_wrapper .dataTables_paginate .paginate_button{ color:var(--bv-text-2) !important; }
    .dataTables_wrapper .dataTables_paginate .paginate_button.current{
      background:var(--bv-accent) !important; color:var(--bv-bg) !important; border-color:var(--bv-accent) !important;
    }
    .dataTables_filter input, .dataTables_length select{
      background:var(--bv-card) !important; color:var(--bv-text) !important; border:1px solid var(--bv-border) !important;
    }

    /* Validation / shiny messages */
    .shiny-output-error-validation{ color:var(--bv-warning); }
  "))),

  titlePanel("BalanceVision — Single-Leg Balance Analytics"),

  # ---- Global filter + data status bar --------------------------------------
  wellPanel(
    fluidRow(
      column(3, checkboxGroupInput("f_ptype", "Participant type:",
                                   choices  = c("Child","Adult","Older adult"),
                                   selected = c("Child","Adult","Older adult"),
                                   inline = TRUE)),
      column(3, checkboxGroupInput("f_sex", "Sex:",
                                   choices  = c("Female","Male","Other","Unspecified"),
                                   selected = c("Female","Male","Other","Unspecified"),
                                   inline = TRUE)),
      column(3,
             checkboxInput("f_completed", "Completed-to-max tests only", FALSE),
             checkboxInput("f_artefact",  "Exclude tracking artefacts",  FALSE)),
      column(3,
             actionButton("refresh", "Refresh data", icon = icon("rotate"),
                          class = "btn-primary"),
             br(), br(),
             uiOutput("status"))
    ),
    div(class = "small-note",
        "* Pelvic variability is affected by hip-line angle wrap; interpret with care. ",
        "Artefact filter removes rows with implausible torso tilt / angular velocity.")
  ),

  tabsetPanel(
    id = "tabs",

    # ---- TAB 1: Scatter Explorer --------------------------------------------
    tabPanel("Scatter Explorer",
      sidebarLayout(
        sidebarPanel(width = 3,
          selectInput("sy", "Y-axis:", choices = CONT_CHOICES, selected = "duration"),
          selectInput("sx", "X-axis:", choices = CONT_CHOICES, selected = "age"),
          selectInput("sz", "Colour by:", choices = CAT_CHOICES, selected = "participantType"),
          sliderInput("salpha", "Opacity (alpha):", min = 0.1, max = 1, value = 0.7, step = 0.05),
          sliderInput("ssize",  "Point size:",      min = 0.5, max = 6, value = 2.5, step = 0.5),
          radioButtons("smooth", "Trend line:",
                       choices = c("None" = "none", "Linear (lm)" = "lm", "LOESS" = "loess"),
                       selected = "lm", inline = TRUE),
          checkboxInput("ageref", "Overlay age-reference norms (Age vs Duration only)", FALSE),
          textInput("plot_title", "Plot title (optional):", placeholder = "Enter a title"),
          actionButton("update_title", "Update title"),
          hr(),
          div(class = "small-note",
              "Hover a point for its ID and values. ",
              "Drag a rectangle to list and summarise the selected points below.")
        ),
        mainPanel(width = 9,
          div(style = "position:relative;",
              plotOutput("scatter", height = "460px",
                         hover = hoverOpts("scatter_hover", delay = 60, delayType = "debounce"),
                         brush = brushOpts("scatter_brush")),
              uiOutput("hover_info")),
          uiOutput("fit_summary"),
          hr(),
          fluidRow(
            column(8,
              h4("Selected points"),
              DT::dataTableOutput("sel_table")),
            column(4,
              h4("Selection statistics"),
              uiOutput("sel_stats"))
          )
        )
      )
    ),

    # ---- TAB 2: Distributions -----------------------------------------------
    tabPanel("Distributions",
      br(),
      fluidRow(
        column(3, div(class = "kpi", div(class = "v", textOutput("kpi_n")),       div(class = "l", "Assessments"))),
        column(3, div(class = "kpi", div(class = "v", textOutput("kpi_part")),    div(class = "l", "Participants"))),
        column(3, div(class = "kpi", div(class = "v", textOutput("kpi_dur")),     div(class = "l", "Mean duration (s)"))),
        column(3, div(class = "kpi", div(class = "v", textOutput("kpi_score")),   div(class = "l", "Mean stability score")))
      ),
      br(),
      sidebarLayout(
        sidebarPanel(width = 3,
          selectInput("dvar", "Variable:", choices = CONT_CHOICES, selected = "duration"),
          sliderInput("dbins", "Bins:", min = 5, max = 60, value = 20),
          checkboxInput("ddens", "Density curve", TRUE),
          checkboxInput("dnorm", "Normal overlay", TRUE)
        ),
        mainPanel(width = 9,
          plotOutput("hist", height = "420px"),
          hr(),
          h4("Summary & normality"),
          uiOutput("dist_stats")
        )
      )
    ),

    # ---- TAB 3: Group Comparisons -------------------------------------------
    tabPanel("Group Comparisons",
      sidebarLayout(
        sidebarPanel(width = 3,
          selectInput("gnum", "Outcome (Y):", choices = CONT_CHOICES, selected = "duration"),
          selectInput("gcat", "Group (X):",   choices = CAT_CHOICES,  selected = "participantType"),
          radioButtons("gtype", "Plot:", choices = c("Box", "Violin"), inline = TRUE)
        ),
        mainPanel(width = 9,
          plotOutput("box", height = "420px"),
          hr(),
          h4("Per-group summary (five-number + mean/SD)"),
          DT::dataTableOutput("group_stats"),
          br(),
          h4("Omnibus test"),
          uiOutput("group_test")
        )
      )
    ),

    # ---- TAB 4: Correlations -------------------------------------------------
    tabPanel("Correlations",
      sidebarLayout(
        sidebarPanel(width = 3,
          checkboxGroupInput("cvars", "Metrics:",
            choices  = CONT_CHOICES,
            selected = c("age","duration","stabilityScore","rmsLateralSway",
                         "meanAngularVelocity","meanTorsoTilt","kneeVariability",
                         "correctiveMovements")),
          radioButtons("cmethod", "Method:",
                       choices = c("pearson", "spearman"), selected = "spearman", inline = TRUE)
        ),
        mainPanel(width = 9,
          plotOutput("corr", height = "480px"),
          hr(),
          h4("Correlation matrix"),
          DT::dataTableOutput("corr_table")
        )
      )
    ),

    # ---- TAB 5: Left–Right Asymmetry ----------------------------------------
    tabPanel("Left-Right Asymmetry",
      br(),
      p(class = "small-note",
        "Uses each participant's best (maximum) duration per support leg. ",
        "Only participants with both a left and a right record are included. ",
        "Repeated records per participant are non-independent by design."),
      fluidRow(
        column(6, plotOutput("asym_plot", height = "440px")),
        column(6,
          h4("Paired comparison"),
          uiOutput("asym_test"),
          hr(),
          DT::dataTableOutput("asym_table"))
      )
    ),

    # ---- TAB 6: Data Explorer ------------------------------------------------
    tabPanel("Data Explorer",
      br(),
      downloadButton("download", "Download filtered data (CSV)"),
      br(), br(),
      DT::dataTableOutput("explorer")
    )
  )
)

# ==============================================================================
# SERVER
# ==============================================================================
server <- function(input, output, session) {

  load_time <- reactiveVal(Sys.time())
  cache     <- reactiveVal(NULL)

  raw <- reactive({
    input$refresh                         # manual refresh dependency
    invalidateLater(AUTO_REFRESH_MS, session)
    d <- load_raw()
    if (!is.null(d) && nrow(d) > 0) { cache(d); load_time(Sys.time()) }
    cache()
  })

  clean <- reactive({ clean_data(raw()) })

  # Global filters applied everywhere
  fdata <- reactive({
    df <- clean()
    if (is.null(df) || nrow(df) == 0)
      stop_msg("Could not load data from the Google Sheet. Check the internet connection and that the sheet is shared as 'Anyone with the link can view', then press Refresh.")
    if (!is.null(input$f_ptype)) df <- df[df$participantType %in% input$f_ptype, , drop = FALSE]
    if (!is.null(input$f_sex))   df <- df[df$sex %in% input$f_sex, , drop = FALSE]
    if (isTRUE(input$f_completed)) df <- df[df$completed %in% TRUE, , drop = FALSE]
    if (isTRUE(input$f_artefact))  df <- df[!df$artefact, , drop = FALSE]
    if (nrow(df) == 0) stop_msg("No rows match the current filters.")
    df
  })

  output$status <- renderUI({
    df <- clean()
    if (is.null(df) || nrow(df) == 0)
      return(HTML("<span style='color:#ef5350'>No data loaded.</span>"))
    HTML(paste0("Loaded <b>", nrow(df), "</b> records &middot; <b>",
                length(unique(df$participantId)), "</b> participants &middot; last refresh ",
                format(load_time(), "%H:%M:%S")))
  })

  # ----- TAB 1: Scatter -------------------------------------------------------
  # Guard against NULL/empty input on startup: toTitleCase() errors on non-character.
  plot_title <- eventReactive(input$update_title, {
    txt <- input$plot_title
    if (is.null(txt) || !nzchar(trimws(txt))) "" else toTitleCase(trimws(txt))
  }, ignoreNULL = FALSE)

  scatter_df <- reactive({
    df <- fdata(); x <- input$sx; y <- input$sy
    df[!is.na(df[[x]]) & !is.na(df[[y]]), , drop = FALSE]
  })

  output$scatter <- renderPlot({ plot_guard({
    d <- scatter_df(); x <- input$sx; y <- input$sy; z <- input$sz
    if (nrow(d) == 0) stop_msg("No non-missing points for the chosen axes.")
    p <- ggplot(d, aes(x = .data[[x]], y = .data[[y]], colour = .data[[z]])) +
      geom_point(alpha = input$salpha, size = input$ssize) +
      scale_bv_d() +
      labs(x = pretty_lab(x), y = pretty_lab(y), colour = pretty_lab(z),
           title = if (isTRUE(nzchar(plot_title()))) plot_title() else NULL) +
      theme_bv(13)

    if (input$smooth == "lm")
      p <- p + geom_smooth(aes(group = 1), method = "lm", formula = y ~ x,
                           se = TRUE, colour = BV$text, fill = BV$muted, linewidth = 0.6)
    if (input$smooth == "loess")
      p <- p + geom_smooth(aes(group = 1), method = "loess", formula = y ~ x,
                           se = TRUE, colour = BV$text, fill = BV$muted, linewidth = 0.6)

    if (isTRUE(input$ageref) && x == "age" && y == "duration") {
      ref <- data.frame(age = c(28, 44, 54, 64, 74, 84),
                        ref = c(44.7, 41.9, 41.2, 32.1, 21.5, 9.4))
      p <- p +
        geom_step(data = ref, aes(x = age, y = ref), inherit.aes = FALSE,
                  linetype = "dashed", colour = BV$warning) +
        geom_point(data = ref, aes(x = age, y = ref), inherit.aes = FALSE,
                   colour = BV$warning, shape = 4, size = 2.5)
    }
    p
  }) })

  output$hover_info <- renderUI({ ui_guard({
    hv <- input$scatter_hover; if (is.null(hv)) return(NULL)
    d <- scatter_df(); x <- input$sx; y <- input$sy; z <- input$sz
    if (nrow(d) == 0) return(NULL)
    pt <- nearPoints(d, hv, xvar = x, yvar = y, threshold = 12, maxpoints = 1)
    if (nrow(pt) == 0) return(NULL)
    style <- paste0(
      "position:absolute; z-index:200; pointer-events:none; ",
      "background-color: rgba(22,36,64,0.96); color:#b0bec5; ",
      "border:1px solid rgba(0,229,255,0.5); ",
      "border-radius:8px; padding:6px 9px; font-size:12px; ",
      "box-shadow:0 4px 24px rgba(0,0,0,0.4); ",
      "left:", hv$coords_css$x + 12, "px; top:", hv$coords_css$y + 12, "px;")
    div(style = style, HTML(paste0(
      "<b>", htmltools::htmlEscape(as.character(pt$participantId)), "</b><br/>",
      pretty_lab(x), ": ", signif(pt[[x]], 3), "<br/>",
      pretty_lab(y), ": ", signif(pt[[y]], 3), "<br/>",
      pretty_lab(z), ": ", htmltools::htmlEscape(as.character(pt[[z]]))
    )))
  }) })

  selected_pts <- reactive({
    d <- scatter_df()
    brushedPoints(d, input$scatter_brush, xvar = input$sx, yvar = input$sy)
  })

  output$sel_table <- DT::renderDataTable({ dt_guard({
    sel <- selected_pts()
    if (nrow(sel) == 0)
      stop_msg("Drag a rectangle over the plot to list the selected points here.")
    cols <- unique(c("participantId","age","sex","participantType","supportLeg",
                     "trialNumber","duration","stabilityScore", input$sx, input$sy))
    cols <- intersect(cols, names(sel))
    DT::datatable(sel[, cols, drop = FALSE], rownames = FALSE,
                  options = list(pageLength = 5, scrollX = TRUE, dom = "tip"))
  }) })

  output$sel_stats <- renderUI({ ui_guard({
    sel <- selected_pts()
    if (nrow(sel) == 0) return(HTML("<em>No points selected.</em>"))
    x <- input$sx; y <- input$sy; xv <- sel[[x]]; yv <- sel[[y]]
    desc <- function(v) c(mean(v, na.rm = TRUE), sd(v, na.rm = TRUE),
                          median(v, na.rm = TRUE), min(v, na.rm = TRUE), max(v, na.rm = TRUE))
    dx <- desc(xv); dy <- desc(yv)
    ok <- sum(!is.na(xv) & !is.na(yv))
    corr <- if (ok >= 3 && sd(xv, na.rm = TRUE) > 0 && sd(yv, na.rm = TRUE) > 0) {
      pr <- suppressWarnings(cor(xv, yv, use = "complete.obs", method = "pearson"))
      sp <- suppressWarnings(cor(xv, yv, use = "complete.obs", method = "spearman"))
      paste0("Pearson r = ", fmt(pr), " &nbsp;|&nbsp; Spearman &rho; = ", fmt(sp),
             " (n=", ok, ")")
    } else "Correlation needs &ge;3 complete pairs with variance."
    HTML(paste0(
      "<b>Selected: n = ", nrow(sel), "</b>",
      "<table style='width:100%;font-size:13px;margin-top:6px;'>",
      "<tr><th></th><th>", pretty_lab(x), "</th><th>", pretty_lab(y), "</th></tr>",
      "<tr><td>Mean</td><td>",   fmt(dx[1]), "</td><td>", fmt(dy[1]), "</td></tr>",
      "<tr><td>SD</td><td>",     fmt(dx[2]), "</td><td>", fmt(dy[2]), "</td></tr>",
      "<tr><td>Median</td><td>", fmt(dx[3]), "</td><td>", fmt(dy[3]), "</td></tr>",
      "<tr><td>Min</td><td>",    fmt(dx[4]), "</td><td>", fmt(dy[4]), "</td></tr>",
      "<tr><td>Max</td><td>",    fmt(dx[5]), "</td><td>", fmt(dy[5]), "</td></tr>",
      "</table><br/>", corr))
  }) })

  output$fit_summary <- renderUI({ ui_guard({
    if (input$smooth != "lm") return(NULL)
    d <- scatter_df(); x <- input$sx; y <- input$sy
    if (nrow(d) < 3 || sd(d[[x]], na.rm = TRUE) == 0) return(NULL)
    m <- lm(d[[y]] ~ d[[x]]); s <- summary(m); co <- coef(s)
    HTML(paste0(
      "<div class='small-note' style='margin-top:6px;'><b>Linear fit (all shown points):</b> ",
      pretty_lab(y), " = ", fmt(co[1,1]), " + ", fmt(co[2,1], 3), " &times; ", pretty_lab(x),
      " &nbsp;|&nbsp; R&sup2; = ", fmt(s$r.squared, 3),
      " &nbsp;|&nbsp; slope p = ", fmt(co[2,4], 4),
      " &nbsp;|&nbsp; n = ", nrow(d), "</div>"))
  }) })

  # ----- TAB 2: Distributions -------------------------------------------------
  output$kpi_n     <- renderText({ tryCatch(nrow(fdata()), error = function(e) "-") })
  output$kpi_part  <- renderText({ tryCatch(length(unique(fdata()$participantId)), error = function(e) "-") })
  output$kpi_dur   <- renderText({ tryCatch(fmt(mean(fdata()$duration, na.rm = TRUE), 1), error = function(e) "-") })
  output$kpi_score <- renderText({ tryCatch(fmt(mean(fdata()$stabilityScore, na.rm = TRUE), 1), error = function(e) "-") })

  output$hist <- renderPlot({ plot_guard({
    df <- fdata(); v <- input$dvar
    d <- df[!is.na(df[[v]]), , drop = FALSE]
    if (nrow(d) == 0) stop_msg("No data for this variable.")
    p <- ggplot(d, aes(x = .data[[v]])) +
      geom_histogram(aes(y = after_stat(density)), bins = input$dbins,
                     fill = BV$accent, colour = BV$bg, alpha = 0.85) +
      labs(x = pretty_lab(v), y = "Density",
           title = paste("Distribution of", pretty_lab(v))) +
      theme_bv(13) +
      geom_vline(xintercept = mean(d[[v]]), colour = BV$text, linetype = "dotted")
    if (isTRUE(input$ddens)) p <- p + geom_density(colour = BV$warning, linewidth = 0.8)
    if (isTRUE(input$dnorm)) {
      m <- mean(d[[v]]); s <- sd(d[[v]])
      if (is.finite(s) && s > 0)
        p <- p + stat_function(fun = dnorm, args = list(mean = m, sd = s),
                               colour = BV$text2, linetype = "dashed")
    }
    p
  }) })

  output$dist_stats <- renderUI({ ui_guard({
    df <- fdata(); v <- input$dvar; x <- df[[v]]; x <- x[!is.na(x)]
    if (length(x) < 1) return(HTML("<em>No data.</em>"))
    sk <- if (sd(x) > 0) mean((x - mean(x))^3) / sd(x)^3 else NA
    sh <- if (length(x) >= 3 && length(x) <= 5000 && sd(x) > 0)
      tryCatch(shapiro.test(x)$p.value, error = function(e) NA) else NA
    HTML(paste0(
      "<table style='font-size:13px;'>",
      "<tr><td style='padding-right:16px;'>n</td><td>", length(x), "</td>",
      "<td style='padding-left:24px;padding-right:16px;'>Median</td><td>", fmt(median(x)), "</td></tr>",
      "<tr><td>Mean</td><td>", fmt(mean(x)), "</td>",
      "<td style='padding-left:24px;'>IQR</td><td>", fmt(IQR(x)), "</td></tr>",
      "<tr><td>SD</td><td>", fmt(sd(x)), "</td>",
      "<td style='padding-left:24px;'>Min / Max</td><td>", fmt(min(x)), " / ", fmt(max(x)), "</td></tr>",
      "<tr><td>Skewness</td><td>", fmt(sk), "</td>",
      "<td style='padding-left:24px;'>Shapiro-Wilk p</td><td>", fmt(sh, 4), "</td></tr>",
      "</table>",
      "<div class='small-note'>Shapiro-Wilk p &lt; 0.05 suggests non-normality &rarr; prefer rank-based tests.</div>"))
  }) })

  # ----- TAB 3: Group Comparisons ---------------------------------------------
  group_df <- reactive({
    df <- fdata(); g <- input$gcat; y <- input$gnum
    df[!is.na(df[[y]]) & !is.na(df[[g]]), , drop = FALSE]
  })

  output$box <- renderPlot({ plot_guard({
    d <- group_df(); g <- input$gcat; y <- input$gnum
    if (nrow(d) == 0) stop_msg("No data for this combination.")
    p <- ggplot(d, aes(x = .data[[g]], y = .data[[y]], fill = .data[[g]]))
    if (input$gtype == "Box")
      p <- p + geom_boxplot(alpha = 0.7, outlier.alpha = 0.5)
    else
      p <- p + geom_violin(alpha = 0.6, scale = "width") +
               geom_boxplot(width = 0.12, alpha = 0.85, outlier.shape = NA)
    p + geom_jitter(width = 0.15, alpha = 0.35, size = 1.2, colour = BV$text2) +
      scale_bv_fill_d() +
      labs(x = pretty_lab(g), y = pretty_lab(y),
           title = paste(pretty_lab(y), "by", pretty_lab(g))) +
      theme_bv(13) +
      theme(legend.position = "none")
  }) })

  output$group_stats <- DT::renderDataTable({ dt_guard({
    d <- group_df(); g <- input$gcat; y <- input$gnum
    if (nrow(d) == 0) stop_msg("No data.")
    parts <- split(d[[y]], droplevels(factor(d[[g]])))
    agg <- do.call(rbind, lapply(names(parts), function(k) {
      v <- parts[[k]]; v <- v[!is.na(v)]
      data.frame(Group = k, n = length(v),
                 Mean = mean(v), SD = sd(v), Min = min(v),
                 Q1 = quantile(v, .25), Median = median(v),
                 Q3 = quantile(v, .75), Max = max(v), IQR = IQR(v),
                 row.names = NULL)
    }))
    num <- sapply(agg, is.numeric); agg[num] <- lapply(agg[num], round, 2)
    DT::datatable(agg, rownames = FALSE, options = list(dom = "t", scrollX = TRUE))
  }) })

  output$group_test <- renderUI({ ui_guard({
    d <- group_df(); g <- droplevels(factor(d[[input$gcat]])); yv <- d[[input$gnum]]
    if (nlevels(g) < 2) return(HTML("<em>Need &ge;2 groups.</em>"))
    aov_p <- tryCatch(summary(aov(yv ~ g))[[1]][["Pr(>F)"]][1], error = function(e) NA)
    kw_p  <- tryCatch(kruskal.test(yv ~ g)$p.value, error = function(e) NA)
    HTML(paste0(
      "One-way ANOVA p = <b>", fmt(aov_p, 4), "</b> (assumes normality + equal variance)<br/>",
      "Kruskal-Wallis p = <b>", fmt(kw_p, 4), "</b> (rank-based, no normality assumption)",
      "<div class='small-note'>With repeated participants, treat these as exploratory; ",
      "use mixed models for confirmatory work.</div>"))
  }) })

  # ----- TAB 4: Correlations --------------------------------------------------
  cor_mat <- reactive({
    df <- fdata(); vars <- input$cvars
    if (length(vars) < 2) stop_msg("Select at least two metrics.")
    vars <- intersect(vars, names(df))
    cor(df[, vars, drop = FALSE], use = "pairwise.complete.obs", method = input$cmethod)
  })

  output$corr <- renderPlot({ plot_guard({
    m <- cor_mat()
    cm <- as.data.frame(as.table(m)); names(cm) <- c("V1", "V2", "r")
    ord <- rownames(m)
    cm$V1 <- factor(cm$V1, levels = ord); cm$V2 <- factor(cm$V2, levels = rev(ord))
    ggplot(cm, aes(V1, V2, fill = r)) +
      geom_tile(colour = BV$bg) +
      geom_text(aes(label = formatC(r, format = "f", digits = 2)),
                size = 3, colour = BV$text) +
      scale_fill_gradient2(low = BV$danger, mid = BV$card, high = BV$accent,
                           midpoint = 0, limits = c(-1, 1)) +
      scale_x_discrete(labels = function(z) vapply(z, pretty_lab, character(1))) +
      scale_y_discrete(labels = function(z) vapply(z, pretty_lab, character(1))) +
      labs(x = NULL, y = NULL,
           fill = paste0(toTitleCase(if (is.null(input$cmethod)) "spearman" else input$cmethod), " r"),
           title = "Correlation matrix (pairwise complete)") +
      theme_bv(12) +
      theme(panel.grid.major = element_blank(),
            axis.text.x = element_text(angle = 45, hjust = 1))
  }) })

  output$corr_table <- DT::renderDataTable({ dt_guard({
    m <- round(cor_mat(), 3)
    out <- data.frame(Metric = vapply(rownames(m), pretty_lab, character(1)), m,
                      check.names = FALSE, row.names = NULL)
    DT::datatable(out, rownames = FALSE, options = list(dom = "t", scrollX = TRUE))
  }) })

  # ----- TAB 5: Left–Right Asymmetry ------------------------------------------
  asym <- reactive({
    df <- fdata()
    d <- df[!is.na(df$duration) & df$supportLeg %in% c("Left","Right"), , drop = FALSE]
    if (nrow(d) == 0) stop_msg("No duration data available.")
    agg <- aggregate(duration ~ participantId + supportLeg, data = d, FUN = max)
    L <- agg[agg$supportLeg == "Left",  c("participantId","duration")]; names(L)[2] <- "Left"
    R <- agg[agg$supportLeg == "Right", c("participantId","duration")]; names(R)[2] <- "Right"
    w <- merge(L, R, by = "participantId")
    if (nrow(w) > 0) {
      w$Diff   <- round(w$Left - w$Right, 1)
      w$AbsPct <- round(100 * abs(w$Diff) / ((w$Left + w$Right) / 2), 1)
    }
    w
  })

  output$asym_plot <- renderPlot({ plot_guard({
    w <- asym()
    if (nrow(w) == 0)
      stop_msg("No participant has both a left and a right record after filtering.")
    lim <- range(c(w$Left, w$Right), na.rm = TRUE)
    ggplot(w, aes(Left, Right)) +
      geom_abline(slope = 1, intercept = 0, linetype = "dashed", colour = BV$muted) +
      geom_point(aes(colour = AbsPct), size = 3, alpha = 0.85) +
      scale_colour_gradient(low = BV$accent, high = BV$danger, name = "|asym| %") +
      coord_equal(xlim = lim, ylim = lim) +
      labs(x = "Best left-support duration (s)",
           y = "Best right-support duration (s)",
           title = "Left vs right best single-leg duration") +
      theme_bv(13)
  }) })

  output$asym_table <- DT::renderDataTable({ dt_guard({
    w <- asym()
    if (nrow(w) == 0) stop_msg("No paired participants.")
    DT::datatable(w, rownames = FALSE, options = list(pageLength = 8, scrollX = TRUE))
  }) })

  output$asym_test <- renderUI({ ui_guard({
    w <- asym()
    if (nrow(w) < 2) return(HTML("<em>Need &ge;2 paired participants for a test.</em>"))
    wt <- tryCatch(wilcox.test(w$Left, w$Right, paired = TRUE), error = function(e) NULL)
    tt <- tryCatch(t.test(w$Left, w$Right, paired = TRUE), error = function(e) NULL)
    HTML(paste0(
      "Paired participants: <b>", nrow(w), "</b><br/>",
      "Mean L-R difference: <b>", fmt(mean(w$Diff)), " s</b><br/>",
      "Mean |asymmetry|: <b>", fmt(mean(w$AbsPct), 1), " %</b><br/>",
      "Wilcoxon signed-rank p = <b>", if (is.null(wt)) "-" else fmt(wt$p.value, 4), "</b><br/>",
      "Paired t-test p = <b>", if (is.null(tt)) "-" else fmt(tt$p.value, 4), "</b>",
      "<div class='small-note'>Duration is capped at the chosen max, so ceiling effects ",
      "can mask true asymmetry; favour the rank-based test.</div>"))
  }) })

  # ----- TAB 6: Data Explorer -------------------------------------------------
  output$explorer <- DT::renderDataTable({ dt_guard({
    DT::datatable(fdata(), rownames = FALSE, filter = "top",
                  options = list(pageLength = 15, scrollX = TRUE))
  }) })

  output$download <- downloadHandler(
    filename = function() paste0("balancevision_", Sys.Date(), ".csv"),
    content  = function(file) utils::write.csv(fdata(), file, row.names = FALSE)
  )
}

shinyApp(ui = ui, server = server)
