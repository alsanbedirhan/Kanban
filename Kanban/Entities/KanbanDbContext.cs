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

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {

    }

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
            entity.Property(e => e.UserId).HasColumnName("user_id");
        });

        modelBuilder.Entity<BoardCard>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("board_cards_pk");

            entity.ToTable("board_cards");

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.BoardColumnId).HasColumnName("board_column_id");
            entity.Property(e => e.BoardId).HasColumnName("board_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Desc).HasColumnName("desc");

            entity.HasOne(d => d.BoardColumn).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.BoardColumnId)
                .HasConstraintName("board_cards_board_columns_fk");

            entity.HasOne(d => d.Board).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.BoardId)
                .HasConstraintName("board_cards_boards_fk");

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.CreatedBy)
                .HasConstraintName("board_cards_created_fk");
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

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
