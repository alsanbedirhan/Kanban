using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace Kanban.Entities;

public partial class KanbanDbContext : DbContext
{
    public KanbanDbContext(DbContextOptions<KanbanDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Board> Boards { get; set; }

    public virtual DbSet<BoardCard> BoardCards { get; set; }

    public virtual DbSet<BoardColumn> BoardColumns { get; set; }

    public virtual DbSet<BoardMember> BoardMembers { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Userinvite> Userinvites { get; set; }

    public virtual DbSet<Usernotification> Usernotifications { get; set; }

    public virtual DbSet<Userverification> Userverifications { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("pgcrypto");

        modelBuilder.Entity<Board>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("boards_pk");

            entity.ToTable("boards");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Title)
                .HasMaxLength(100)
                .HasColumnName("title");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
            entity.Property(e => e.UserId).HasColumnName("user_id");
        });

        modelBuilder.Entity<BoardCard>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("board_cards_pk");

            entity.ToTable("board_cards");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.AssigneeUserId).HasColumnName("assignee_user_id");
            entity.Property(e => e.BoardColumnId).HasColumnName("board_column_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.Desc).HasColumnName("desc");
            entity.Property(e => e.DueDate).HasColumnName("due_date");
            entity.Property(e => e.HighlightColor)
                .HasMaxLength(10)
                .HasColumnName("highlight_color");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.OrderNo).HasColumnName("order_no");
            entity.Property(e => e.WarningDays).HasColumnName("warning_days");

            entity.HasOne(d => d.AssigneeUser).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.AssigneeUserId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("board_cards_users_fk");

            entity.HasOne(d => d.BoardColumn).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.BoardColumnId)
                .HasConstraintName("board_cards_board_columns_fk");
        });

        modelBuilder.Entity<BoardColumn>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("board_columns_pk");

            entity.ToTable("board_columns");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.BoardId).HasColumnName("board_id");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Title)
                .HasMaxLength(100)
                .HasColumnName("title");

            entity.HasOne(d => d.Board).WithMany(p => p.BoardColumns)
                .HasForeignKey(d => d.BoardId)
                .HasConstraintName("board_columns_boards_fk");
        });

        modelBuilder.Entity<BoardMember>(entity =>
        {
            entity.HasKey(e => new { e.BoardId, e.UserId }).HasName("board_members_pk");

            entity.ToTable("board_members");

            entity.Property(e => e.BoardId).HasColumnName("board_id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.RoleCode)
                .HasDefaultValueSql("'MEM'::text")
                .HasColumnName("role_code");

            entity.HasOne(d => d.Board).WithMany(p => p.BoardMembers)
                .HasForeignKey(d => d.BoardId)
                .HasConstraintName("board_members_boards_fk");

            entity.HasOne(d => d.User).WithMany(p => p.BoardMembers)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("board_members_users_fk");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("users_pk");

            entity.ToTable("users");

            entity.HasIndex(e => e.Email, "users_email_unique").IsUnique();

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.Avatar)
                .HasMaxLength(20)
                .HasDefaultValueSql("'def'::character varying")
                .HasColumnName("avatar");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(100)
                .HasColumnName("email");
            entity.Property(e => e.FullName)
                .HasMaxLength(100)
                .HasColumnName("full_name");
            entity.Property(e => e.HashPassword)
                .HasMaxLength(255)
                .HasColumnName("hash_password");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.SecurityStamp)
                .HasMaxLength(255)
                .HasDefaultValueSql("(gen_random_uuid())::text")
                .HasColumnName("security_stamp");
        });

        modelBuilder.Entity<Userinvite>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("userinvites_pk");

            entity.ToTable("userinvites");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.BoardId).HasColumnName("board_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(100)
                .HasColumnName("email");
            entity.Property(e => e.IsAccepted).HasColumnName("is_accepted");
            entity.Property(e => e.IsUsed).HasColumnName("is_used");
            entity.Property(e => e.SenderUserId).HasColumnName("sender_user_id");

            entity.HasOne(d => d.Board).WithMany(p => p.Userinvites)
                .HasForeignKey(d => d.BoardId)
                .HasConstraintName("userinvites_board_fk");

            entity.HasOne(d => d.SenderUser).WithMany(p => p.Userinvites)
                .HasForeignKey(d => d.SenderUserId)
                .HasConstraintName("userinvites_users_fk");
        });

        modelBuilder.Entity<Usernotification>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("usernotifications_pk");

            entity.ToTable("usernotifications");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.IsDeleted).HasColumnName("is_deleted");
            entity.Property(e => e.Message)
                .HasMaxLength(500)
                .HasColumnName("message");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.Usernotifications)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("usernotifications_users_fk");
        });

        modelBuilder.Entity<Userverification>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("userverifications_pk");

            entity.ToTable("userverifications");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.Code)
                .HasMaxLength(10)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(100)
                .HasColumnName("email");
            entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
            entity.Property(e => e.IsUsed).HasColumnName("is_used");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
