using System;
using System.Collections.Generic;

namespace Kanban.Entities;

public partial class Board
{
    public long Id { get; set; }

    public long UserId { get; set; }

    public bool IsActive { get; set; }

    public string Title { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<BoardCard> BoardCards { get; set; } = new List<BoardCard>();

    public virtual ICollection<BoardColumn> BoardColumns { get; set; } = new List<BoardColumn>();

    public virtual ICollection<BoardMember> BoardMembers { get; set; } = new List<BoardMember>();
}
