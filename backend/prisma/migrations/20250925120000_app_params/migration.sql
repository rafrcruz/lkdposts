-- CreateTable
CREATE TABLE "public"."app_params" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "posts_refresh_cooldown_seconds" INTEGER NOT NULL,
    "posts_time_window_days" INTEGER NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_params_pkey" PRIMARY KEY ("id")
);

