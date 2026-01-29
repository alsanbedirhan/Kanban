using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class User
{
    public long Id { get; set; }

    public string FullName { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string HashPassword { get; set; } = null!;

    public bool IsActive { get; set; }

    public string SecurityStamp { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public string Avatar { get; set; } = null!;

    public string? QuickNote { get; set; }

    public virtual ICollection<BoardCardComment> BoardCardComments { get; set; } = new List<BoardCardComment>();

    public virtual ICollection<BoardCard> BoardCards { get; set; } = new List<BoardCard>();

    public virtual ICollection<BoardMember> BoardMembers { get; set; } = new List<BoardMember>();

    public virtual ICollection<Board> Boards { get; set; } = new List<Board>();

    public virtual ICollection<UserInvite> UserInvites { get; set; } = new List<UserInvite>();

    public virtual ICollection<UserNotification> UserNotifications { get; set; } = new List<UserNotification>();
}
