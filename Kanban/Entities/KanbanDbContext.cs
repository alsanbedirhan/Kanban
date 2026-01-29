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

    public virtual DbSet<BoardCardComment> BoardCardComments { get; set; }

    public virtual DbSet<BoardColumn> BoardColumns { get; set; }

    public virtual DbSet<BoardMember> BoardMembers { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserInvite> UserInvites { get; set; }

    public virtual DbSet<UserNotification> UserNotifications { get; set; }

    public virtual DbSet<UserVerification> UserVerifications { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Board>(entity =>
        {
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Title).HasMaxLength(100);
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("(getdate())");

            entity.HasOne(d => d.User).WithMany(p => p.Boards)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("Boards_Users_FK");
        });

        modelBuilder.Entity<BoardCard>(entity =>
        {
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Desc).HasColumnType("text");
            entity.Property(e => e.HighlightColor).HasMaxLength(10);
            entity.Property(e => e.IsActive).HasDefaultValue(true);

            entity.HasOne(d => d.AssigneeUser).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.AssigneeUserId)
                .HasConstraintName("FK_BoardCards_Users");

            entity.HasOne(d => d.BoardColumn).WithMany(p => p.BoardCards)
                .HasForeignKey(d => d.BoardColumnId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BoardCards_BoardColumns");
        });

        modelBuilder.Entity<BoardCardComment>(entity =>
        {
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Message).HasMaxLength(500);

            entity.HasOne(d => d.BoardCard).WithMany(p => p.BoardCardComments)
                .HasForeignKey(d => d.BoardCardId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BoardCardComments_BoardCards");

            entity.HasOne(d => d.User).WithMany(p => p.BoardCardComments)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BoardCardComments_Users");
        });

        modelBuilder.Entity<BoardColumn>(entity =>
        {
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.Title).HasMaxLength(100);

            entity.HasOne(d => d.Board).WithMany(p => p.BoardColumns)
                .HasForeignKey(d => d.BoardId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BoardColumns_Boards");
        });

        modelBuilder.Entity<BoardMember>(entity =>
        {
            entity.HasKey(e => new { e.BoardId, e.UserId });

            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.RoleCode)
                .HasMaxLength(50)
                .HasDefaultValue("MEM");

            entity.HasOne(d => d.Board).WithMany(p => p.BoardMembers)
                .HasForeignKey(d => d.BoardId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BoardMembers_Boards");

            entity.HasOne(d => d.User).WithMany(p => p.BoardMembers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_BoardMembers_Users");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(e => e.Email, "UQ_Users_Email").IsUnique();

            entity.Property(e => e.Avatar)
                .HasMaxLength(20)
                .HasDefaultValue("def");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Email).HasMaxLength(100);
            entity.Property(e => e.FullName).HasMaxLength(100);
            entity.Property(e => e.HashPassword).HasMaxLength(255);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.QuickNote).HasMaxLength(1000);
            entity.Property(e => e.SecurityStamp)
                .HasMaxLength(255)
                .HasDefaultValueSql("(CONVERT([nvarchar](36),newid()))");
        });

        modelBuilder.Entity<UserInvite>(entity =>
        {
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Email).HasMaxLength(100);

            entity.HasOne(d => d.Board).WithMany(p => p.UserInvites)
                .HasForeignKey(d => d.BoardId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserInvites_Boards");

            entity.HasOne(d => d.SenderUser).WithMany(p => p.UserInvites)
                .HasForeignKey(d => d.SenderUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserInvites_Users");
        });

        modelBuilder.Entity<UserNotification>(entity =>
        {
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Message).HasMaxLength(500);

            entity.HasOne(d => d.User).WithMany(p => p.UserNotifications)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_UserNotifications_Users");
        });

        modelBuilder.Entity<UserVerification>(entity =>
        {
            entity.Property(e => e.Code).HasMaxLength(10);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(getdate())");
            entity.Property(e => e.Email).HasMaxLength(100);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
