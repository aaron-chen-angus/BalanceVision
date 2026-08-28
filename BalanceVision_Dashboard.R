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

# ==============================================================================
# UI
# ==============================================================================
ui <- fluidPage(
  theme = shinytheme("flatly"),
  tags$head(tags$style(HTML("
    .kpi{background:#f4f6f8;border-radius:6px;padding:10px 12px;text-align:center;}
    .kpi .v{font-size:22px;font-weight:700;color:#2C3E50;}
    .kpi .l{font-size:12px;color:#657;}
    .small-note{font-size:12px;color:#777;}
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
    validate(need(!is.null(df) && nrow(df) > 0,
                  "Could not load data from the Google Sheet. Check the internet connection and that the sheet is shared as 'Anyone with the link can view', then press Refresh."))
    if (!is.null(input$f_ptype)) df <- df[df$participantType %in% input$f_ptype, , drop = FALSE]
    if (!is.null(input$f_sex))   df <- df[df$sex %in% input$f_sex, , drop = FALSE]
    if (isTRUE(input$f_completed)) df <- df[df$completed %in% TRUE, , drop = FALSE]
    if (isTRUE(input$f_artefact))  df <- df[!df$artefact, , drop = FALSE]
    validate(need(nrow(df) > 0, "No rows match the current filters."))
    df
  })

  output$status <- renderUI({
    df <- clean()
    if (is.null(df) || nrow(df) == 0)
      return(HTML("<span style='color:#c0392b'>No data loaded.</span>"))
    HTML(paste0("Loaded <b>", nrow(df), "</b> records &middot; <b>",
                length(unique(df$participantId)), "</b> participants &middot; last refresh ",
                format(load_time(), "%H:%M:%S")))
  })

  # ----- TAB 1: Scatter -------------------------------------------------------
  plot_title <- eventReactive(input$update_title, toTitleCase(input$plot_title),
                              ignoreNULL = FALSE)

  scatter_df <- reactive({
    df <- fdata(); x <- input$sx; y <- input$sy
    df[!is.na(df[[x]]) & !is.na(df[[y]]), , drop = FALSE]
  })

  output$scatter <- renderPlot({
    d <- scatter_df(); x <- input$sx; y <- input$sy; z <- input$sz
    validate(need(nrow(d) > 0, "No non-missing points for the chosen axes."))
    p <- ggplot(d, aes(x = .data[[x]], y = .data[[y]], colour = .data[[z]])) +
      geom_point(alpha = input$salpha, size = input$ssize) +
      scale_colour_viridis_d(option = "D", end = 0.9, na.value = "grey70") +
      labs(x = pretty_lab(x), y = pretty_lab(y), colour = pretty_lab(z),
           title = if (isTRUE(nzchar(plot_title()))) plot_title() else NULL) +
      theme_minimal(base_size = 13)

    if (input$smooth == "lm")
      p <- p + geom_smooth(aes(group = 1), method = "lm", formula = y ~ x,
                           se = TRUE, colour = "black", linewidth = 0.6)
    if (input$smooth == "loess")
      p <- p + geom_smooth(aes(group = 1), method = "loess", formula = y ~ x,
                           se = TRUE, colour = "black", linewidth = 0.6)

    if (isTRUE(input$ageref) && x == "age" && y == "duration") {
      ref <- data.frame(age = c(28, 44, 54, 64, 74, 84),
                        ref = c(44.7, 41.9, 41.2, 32.1, 21.5, 9.4))
      p <- p +
        geom_step(data = ref, aes(x = age, y = ref), inherit.aes = FALSE,
                  linetype = "dashed", colour = "#c0392b") +
        geom_point(data = ref, aes(x = age, y = ref), inherit.aes = FALSE,
                   colour = "#c0392b", shape = 4, size = 2.5)
    }
    p
  })

  output$hover_info <- renderUI({
    hv <- input$scatter_hover; if (is.null(hv)) return(NULL)
    d <- scatter_df(); x <- input$sx; y <- input$sy; z <- input$sz
    if (nrow(d) == 0) return(NULL)
    pt <- nearPoints(d, hv, xvar = x, yvar = y, threshold = 12, maxpoints = 1)
    if (nrow(pt) == 0) return(NULL)
    style <- paste0(
      "position:absolute; z-index:200; pointer-events:none; ",
      "background-color: rgba(255,255,255,0.93); border:1px solid #999; ",
      "border-radius:4px; padding:5px 8px; font-size:12px; ",
      "left:", hv$coords_css$x + 12, "px; top:", hv$coords_css$y + 12, "px;")
    div(style = style, HTML(paste0(
      "<b>", htmltools::htmlEscape(as.character(pt$participantId)), "</b><br/>",
      pretty_lab(x), ": ", signif(pt[[x]], 3), "<br/>",
      pretty_lab(y), ": ", signif(pt[[y]], 3), "<br/>",
      pretty_lab(z), ": ", htmltools::htmlEscape(as.character(pt[[z]]))
    )))
  })

  selected_pts <- reactive({
    d <- scatter_df()
    brushedPoints(d, input$scatter_brush, xvar = input$sx, yvar = input$sy)
  })

  output$sel_table <- DT::renderDataTable({
    sel <- selected_pts()
    validate(need(nrow(sel) > 0,
                  "Drag a rectangle over the plot to list the selected points here."))
    cols <- unique(c("participantId","age","sex","participantType","supportLeg",
                     "trialNumber","duration","stabilityScore", input$sx, input$sy))
    cols <- intersect(cols, names(sel))
    DT::datatable(sel[, cols, drop = FALSE], rownames = FALSE,
                  options = list(pageLength = 5, scrollX = TRUE, dom = "tip"))
  })

  output$sel_stats <- renderUI({
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
  })

  output$fit_summary <- renderUI({
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
  })

  # ----- TAB 2: Distributions -------------------------------------------------
  output$kpi_n     <- renderText({ nrow(fdata()) })
  output$kpi_part  <- renderText({ length(unique(fdata()$participantId)) })
  output$kpi_dur   <- renderText({ fmt(mean(fdata()$duration, na.rm = TRUE), 1) })
  output$kpi_score <- renderText({ fmt(mean(fdata()$stabilityScore, na.rm = TRUE), 1) })

  output$hist <- renderPlot({
    df <- fdata(); v <- input$dvar
    d <- df[!is.na(df[[v]]), , drop = FALSE]
    validate(need(nrow(d) > 0, "No data for this variable."))
    p <- ggplot(d, aes(x = .data[[v]])) +
      geom_histogram(aes(y = after_stat(density)), bins = input$dbins,
                     fill = "#3498db", colour = "white", alpha = 0.85) +
      labs(x = pretty_lab(v), y = "Density",
           title = paste("Distribution of", pretty_lab(v))) +
      theme_minimal(base_size = 13) +
      geom_vline(xintercept = mean(d[[v]]), colour = "#2c3e50", linetype = "dotted")
    if (isTRUE(input$ddens)) p <- p + geom_density(colour = "#e74c3c", linewidth = 0.8)
    if (isTRUE(input$dnorm)) {
      m <- mean(d[[v]]); s <- sd(d[[v]])
      if (is.finite(s) && s > 0)
        p <- p + stat_function(fun = dnorm, args = list(mean = m, sd = s),
                               colour = "black", linetype = "dashed")
    }
    p
  })

  output$dist_stats <- renderUI({
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
  })

  # ----- TAB 3: Group Comparisons ---------------------------------------------
  group_df <- reactive({
    df <- fdata(); g <- input$gcat; y <- input$gnum
    df[!is.na(df[[y]]) & !is.na(df[[g]]), , drop = FALSE]
  })

  output$box <- renderPlot({
    d <- group_df(); g <- input$gcat; y <- input$gnum
    validate(need(nrow(d) > 0, "No data for this combination."))
    p <- ggplot(d, aes(x = .data[[g]], y = .data[[y]], fill = .data[[g]]))
    if (input$gtype == "Box")
      p <- p + geom_boxplot(alpha = 0.7, outlier.alpha = 0.5)
    else
      p <- p + geom_violin(alpha = 0.6, scale = "width") +
               geom_boxplot(width = 0.12, alpha = 0.85, outlier.shape = NA)
    p + geom_jitter(width = 0.15, alpha = 0.35, size = 1.2) +
      scale_fill_viridis_d(option = "D", end = 0.9, na.value = "grey70") +
      labs(x = pretty_lab(g), y = pretty_lab(y),
           title = paste(pretty_lab(y), "by", pretty_lab(g))) +
      theme_minimal(base_size = 13) +
      theme(legend.position = "none")
  })

  output$group_stats <- DT::renderDataTable({
    d <- group_df(); g <- input$gcat; y <- input$gnum
    validate(need(nrow(d) > 0, "No data."))
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
  })

  output$group_test <- renderUI({
    d <- group_df(); g <- droplevels(factor(d[[input$gcat]])); yv <- d[[input$gnum]]
    if (nlevels(g) < 2) return(HTML("<em>Need &ge;2 groups.</em>"))
    aov_p <- tryCatch(summary(aov(yv ~ g))[[1]][["Pr(>F)"]][1], error = function(e) NA)
    kw_p  <- tryCatch(kruskal.test(yv ~ g)$p.value, error = function(e) NA)
    HTML(paste0(
      "One-way ANOVA p = <b>", fmt(aov_p, 4), "</b> (assumes normality + equal variance)<br/>",
      "Kruskal-Wallis p = <b>", fmt(kw_p, 4), "</b> (rank-based, no normality assumption)",
      "<div class='small-note'>With repeated participants, treat these as exploratory; ",
      "use mixed models for confirmatory work.</div>"))
  })

  # ----- TAB 4: Correlations --------------------------------------------------
  cor_mat <- reactive({
    df <- fdata(); vars <- input$cvars
    validate(need(length(vars) >= 2, "Select at least two metrics."))
    vars <- intersect(vars, names(df))
    cor(df[, vars, drop = FALSE], use = "pairwise.complete.obs", method = input$cmethod)
  })

  output$corr <- renderPlot({
    m <- cor_mat()
    cm <- as.data.frame(as.table(m)); names(cm) <- c("V1", "V2", "r")
    ord <- rownames(m)
    cm$V1 <- factor(cm$V1, levels = ord); cm$V2 <- factor(cm$V2, levels = rev(ord))
    ggplot(cm, aes(V1, V2, fill = r)) +
      geom_tile(colour = "white") +
      geom_text(aes(label = formatC(r, format = "f", digits = 2)), size = 3) +
      scale_fill_gradient2(low = "#b2182b", mid = "white", high = "#2166ac",
                           midpoint = 0, limits = c(-1, 1)) +
      scale_x_discrete(labels = function(z) vapply(z, pretty_lab, character(1))) +
      scale_y_discrete(labels = function(z) vapply(z, pretty_lab, character(1))) +
      labs(x = NULL, y = NULL, fill = paste0(toTitleCase(input$cmethod), " r"),
           title = "Correlation matrix (pairwise complete)") +
      theme_minimal(base_size = 12) +
      theme(axis.text.x = element_text(angle = 45, hjust = 1))
  })

  output$corr_table <- DT::renderDataTable({
    m <- round(cor_mat(), 3)
    out <- data.frame(Metric = vapply(rownames(m), pretty_lab, character(1)), m,
                      check.names = FALSE, row.names = NULL)
    DT::datatable(out, rownames = FALSE, options = list(dom = "t", scrollX = TRUE))
  })

  # ----- TAB 5: Left–Right Asymmetry ------------------------------------------
  asym <- reactive({
    df <- fdata()
    d <- df[!is.na(df$duration) & df$supportLeg %in% c("Left","Right"), , drop = FALSE]
    validate(need(nrow(d) > 0, "No duration data available."))
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

  output$asym_plot <- renderPlot({
    w <- asym()
    validate(need(nrow(w) > 0,
                  "No participant has both a left and a right record after filtering."))
    lim <- range(c(w$Left, w$Right), na.rm = TRUE)
    ggplot(w, aes(Left, Right)) +
      geom_abline(slope = 1, intercept = 0, linetype = "dashed", colour = "grey55") +
      geom_point(aes(colour = AbsPct), size = 3, alpha = 0.85) +
      scale_colour_gradient(low = "#2166ac", high = "#b2182b", name = "|asym| %") +
      coord_equal(xlim = lim, ylim = lim) +
      labs(x = "Best left-support duration (s)",
           y = "Best right-support duration (s)",
           title = "Left vs right best single-leg duration") +
      theme_minimal(base_size = 13)
  })

  output$asym_table <- DT::renderDataTable({
    w <- asym()
    validate(need(nrow(w) > 0, "No paired participants."))
    DT::datatable(w, rownames = FALSE, options = list(pageLength = 8, scrollX = TRUE))
  })

  output$asym_test <- renderUI({
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
  })

  # ----- TAB 6: Data Explorer -------------------------------------------------
  output$explorer <- DT::renderDataTable({
    DT::datatable(fdata(), rownames = FALSE, filter = "top",
                  options = list(pageLength = 15, scrollX = TRUE))
  })

  output$download <- downloadHandler(
    filename = function() paste0("balancevision_", Sys.Date(), ".csv"),
    content  = function(file) utils::write.csv(fdata(), file, row.names = FALSE)
  )
}

shinyApp(ui = ui, server = server)
